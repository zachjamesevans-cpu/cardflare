import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The finish-setting-up screen.
 *
 * It shows the address the invitation went to and asks for a password. That
 * only works because the visitor is *already signed in* — the callback
 * exchanged the token on the way through — so the address is read from the
 * session rather than typed, and the password form has a session to write to.
 *
 * Which makes the signed-out case the one worth pinning. Nobody arrives here
 * signed out except by following a link that has expired, and this page must
 * not render a password form that would have nothing to save. It also must not
 * send them to `/login`: an invited store has no password yet.
 */

const getViewer = vi.fn();
const claimPendingInvite = vi.fn();
const accountIdentity = vi.fn();
const needsSetup = vi.fn();
const redirect = vi.fn((path: string) => {
  // Next's redirect throws to unwind rendering; mirroring that means a missing
  // redirect shows up as a returned element rather than passing silently.
  throw new Error(`REDIRECT:${path}`);
});

vi.mock("next/navigation", () => ({ redirect: (p: string) => redirect(p) }));
vi.mock("@/lib/auth/session", () => ({
  getViewer: () => getViewer(),
  claimPendingInvite: (...a: unknown[]) => claimPendingInvite(...a),
}));
vi.mock("@/lib/players/account-identity", () => ({
  accountIdentity: (...a: unknown[]) => accountIdentity(...a),
}));
vi.mock("@/lib/players/profile", () => ({
  needsSetup: (...a: unknown[]) => needsSetup(...a),
}));

const WelcomePage = (await import("@/app/welcome/page")).default;

/** Renders the page, returning where it redirected or the tree it produced. */
async function visit() {
  try {
    return { redirected: null, tree: await WelcomePage() };
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith("REDIRECT:")) {
      return { redirected: message.slice("REDIRECT:".length), tree: null };
    }
    throw error;
  }
}

/**
 * Text the visitor can actually read.
 *
 * Children only, deliberately. Walking every prop finds the address twice —
 * once on screen and once in the password form's hidden `signedInAs` — so a
 * version of this page that stopped displaying it at all still looked fine.
 */
function visibleText(node: unknown, found: string[] = []): string[] {
  if (typeof node === "string") found.push(node);
  else if (Array.isArray(node)) for (const child of node) visibleText(child, found);
  else if (node && typeof node === "object") {
    const props = (node as { props?: { children?: unknown } }).props;
    if (props) visibleText(props.children, found);
  }
  return found;
}

/** The props of the first element in the tree carrying the named prop. */
function propsWith(node: unknown, key: string): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = propsWith(child, key);
      if (hit) return hit;
    }
    return null;
  }

  if (!node || typeof node !== "object") return null;

  const props = (node as { props?: Record<string, unknown> }).props;
  if (!props) return null;
  if (key in props) return props;

  return propsWith(props.children, key);
}

beforeEach(() => {
  getViewer.mockReset();
  claimPendingInvite.mockReset();
  accountIdentity.mockReset();
  needsSetup.mockReset();
  redirect.mockClear();

  accountIdentity.mockResolvedValue(null);
  needsSetup.mockResolvedValue(true);
});

describe("/welcome", () => {
  it("shows the address the store is setting up, rather than asking for it", async () => {
    getViewer.mockResolvedValue({
      kind: "store",
      user: { id: "u1", email: "owner@grandlinegames.com" },
      storeIds: ["s1"],
    });

    const { tree } = await visit();

    expect(visibleText(tree)).toContain("owner@grandlinegames.com");
  });

  /*
   * And hands it to the password form as well. That field is hidden and is
   * there for password managers: without a username in the form most of them
   * either skip the save prompt or file it under the wrong entry, which for a
   * store's only credential is worth a line of test.
   */
  it("tells the password form which account it is for", async () => {
    getViewer.mockResolvedValue({
      kind: "store",
      user: { id: "u1", email: "owner@grandlinegames.com" },
      storeIds: ["s1"],
    });

    const { tree } = await visit();

    expect(propsWith(tree, "signedInAs")).toMatchObject({
      signedInAs: "owner@grandlinegames.com",
    });
  });

  /*
   * An invitation is claimed at the callback, but a store whose row is still
   * catching up must still be able to set a password — being signed in is the
   * only thing this page needs.
   */
  it("works for an account not yet attached to a store", async () => {
    getViewer.mockResolvedValue({
      kind: "unaffiliated",
      user: { id: "u1", email: "owner@grandlinegames.com" },
    });

    const { redirected, tree } = await visit();

    expect(redirected).toBeNull();
    expect(tree).not.toBeNull();
  });

  /*
   * The bug this pins, and it reached a real person. Savannah was invited
   * as a PLAYER, and the screen after her password said "go to your
   * store". The page had asked "is this a player?" and given everybody
   * else the store wording — so a player whose account row had not been
   * created yet fell through to it.
   *
   * A person with no store membership is not a store.
   */
  it("never tells somebody without a store that they have one", async () => {
    getViewer.mockResolvedValue({
      kind: "unaffiliated",
      user: { id: "u1", email: "savannah@example.com" },
    });

    const { tree } = await visit();
    const words = visibleText(tree).join(" ").toLowerCase();

    expect(words).not.toContain("your store");
    expect(propsWith(tree, "continueHref")).toMatchObject({
      continueHref: "/profile",
    });
  });

  it("retries the invitation claim, so a failed one is not permanent", async () => {
    /* Creating the player row can fail on the way in, and the invite is
       left open precisely so the next page load can try again. Without
       the retry the account exists and the person is stuck being nobody. */
    getViewer.mockResolvedValue({
      kind: "unaffiliated",
      user: { id: "u1", email: "savannah@example.com" },
    });

    await visit();

    expect(claimPendingInvite).toHaveBeenCalledWith({
      id: "u1",
      email: "savannah@example.com",
    });
  });

  it("asks a player for a password and a name on one screen", async () => {
    /* The founder, watching a first sign-up: "the username should also be
       something you can type in on the same screen. It should not go to
       'choose your username' after." */
    getViewer.mockResolvedValue({
      kind: "player",
      user: { id: "u1", email: "savannah@example.com" },
      playerId: "p1",
      playerName: "Savannah",
    });
    accountIdentity.mockResolvedValue({ playerId: "p1", displayName: "Savannah" });

    const { tree } = await visit();

    expect(propsWith(tree, "withPassword")).toMatchObject({
      withPassword: true,
      suggestion: "Savannah",
    });
  });

  it("turns a signed-out visitor away, to a fresh link rather than a sign-in form", async () => {
    getViewer.mockResolvedValue({ kind: "anonymous" });

    await expect(visit()).resolves.toMatchObject({
      redirected: "/login/reset?expired=1",
    });
  });
});
