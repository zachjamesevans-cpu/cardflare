import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The one-click invitation, end to end through the Server Action.
 *
 * Inviting a store used to send an email whose only job was to point at a
 * form, which asked for the address that email had just been sent to, so that
 * a *second* email could carry the link that actually did something. This
 * covers the replacement: a Supabase-minted token wrapped in our own URL,
 * carried by cardflare's own invitation.
 *
 * Supabase is mocked at the admin client rather than at `generateSetupLink`,
 * so the arguments we send Supabase are part of what is under test. Two
 * things are easy to get wrong and silent when wrong: `type` must be
 * `recovery` (an `invite` link creates the user and fails on the one
 * `ensureAuthUser` has already made), and the emailed URL must be built from
 * `hashed_token`, never from the `action_link` Supabase also returns — the
 * action link only hands a session to the browser that requested it, and the
 * requester here is the admin's server, not the shop owner's phone.
 */

const generateLink = vi.fn();
const inviteStore = vi.fn();
const sendEmail = vi.fn();
const getViewer = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    auth: { admin: { generateLink: (...a: unknown[]) => generateLink(...a) } },
  }),
}));

vi.mock("@/lib/stores/repository", () => ({
  inviteStore: (...a: unknown[]) => inviteStore(...a),
}));

vi.mock("@/lib/email/client", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}));

vi.mock("@/lib/auth/session", () => ({
  getViewer: () => getViewer(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { generateSetupLink } = await import("@/lib/auth/invite-link");
const { inviteStoreAction } = await import("@/lib/stores/actions");
const { INVITE_STORE_IDLE } = await import("@/lib/stores/schema");

const TOKEN_HASH = "8f3a1c7e2b4d8f0a6c1e3b5d7f9a2c4e";

/** What Supabase's verify endpoint would have been — the trap, not the link. */
const ACTION_LINK = `https://project.supabase.co/auth/v1/verify?token=${TOKEN_HASH}&type=recovery`;

/** The link the email must carry: our own domain, redeemable from any device. */
const SETUP_LINK = `https://cardflare.gg/auth/confirm?token_hash=${TOKEN_HASH}&type=recovery&next=%2Fwelcome`;

function formData() {
  const data = new FormData();
  data.set("name", "Grand Line Games");
  data.set("contactEmail", "owner@grandlinegames.com");
  return data;
}

function invite() {
  return inviteStoreAction(INVITE_STORE_IDLE, formData());
}

/** The message handed to the mailer on the most recent send. */
function sentMessage() {
  return sendEmail.mock.calls.at(-1)?.[0] as { html: string; text: string };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://cardflare.gg";

  generateLink.mockReset().mockResolvedValue({
    data: { properties: { action_link: ACTION_LINK, hashed_token: TOKEN_HASH } },
    error: null,
  });

  inviteStore.mockReset().mockResolvedValue({
    outcome: "invited",
    store: {
      name: "Grand Line Games",
      contact_email: "owner@grandlinegames.com",
    },
  });

  sendEmail.mockReset().mockResolvedValue({ status: "sent" });

  getViewer.mockReset().mockResolvedValue({
    kind: "admin",
    user: { id: "admin-1", email: "zach@cardflare.gg" },
  });
});

describe("generateSetupLink", () => {
  it("builds the link on our own domain from the hashed token", async () => {
    await expect(generateSetupLink("owner@grandlinegames.com")).resolves.toBe(
      SETUP_LINK,
    );
  });

  /*
   * The action link is the one Supabase makes look obvious, and it only hands
   * a session to the browser that requested it — which was the admin's
   * server, not the shop owner's phone. An emailed action link dies on any
   * device that has never touched cardflare, which is all of them.
   */
  it("never emails the action link, even though Supabase returns one", async () => {
    const link = await generateSetupLink("owner@grandlinegames.com");

    expect(link).not.toContain("supabase.co");
    expect(link).not.toBe(ACTION_LINK);
  });

  /*
   * `invite` creates the auth user itself and errors on one that already
   * exists — and `ensureAuthUser` has already created it by this point, on
   * purpose. `recovery` works on an account that has never had a password,
   * which is exactly the case here.
   */
  it("asks for a recovery link, not an invite link", async () => {
    await generateSetupLink("owner@grandlinegames.com");

    expect(generateLink).toHaveBeenCalledWith(
      expect.objectContaining({ type: "recovery", email: "owner@grandlinegames.com" }),
    );
  });

  /*
   * The whole point of the flow: the link must land on the setup screen, via
   * the route that turns the token into a session. Sent anywhere else it
   * signs them in and drops them somewhere with no password field.
   */
  it("aims the link at the setup screen", async () => {
    const link = new URL((await generateSetupLink("owner@grandlinegames.com"))!);

    expect(link.pathname).toBe("/auth/confirm");
    expect(link.searchParams.get("next")).toBe("/welcome");
    expect(link.searchParams.get("type")).toBe("recovery");
    expect(link.searchParams.get("token_hash")).toBe(TOKEN_HASH);
  });

  it.each([
    ["Supabase errors", { data: null, error: { message: "boom" } }],
    [
      "the response carries no token",
      { data: { properties: { action_link: ACTION_LINK } }, error: null },
    ],
  ])("returns null when %s", async (_label, response) => {
    generateLink.mockResolvedValue(response);

    await expect(generateSetupLink("owner@grandlinegames.com")).resolves.toBeNull();
  });
});

describe("inviteStoreAction", () => {
  it("puts the one-click link in the email it sends", async () => {
    await invite();

    expect(sentMessage().text).toContain(SETUP_LINK);
    expect(sentMessage().html).toContain(SETUP_LINK);
  });

  /*
   * The link signs its holder in as that store, so it is a credential. Once
   * it is in the store's inbox there is no reason to also paint it on an
   * admin's screen, where it outlives the request in a browser tab.
   */
  it("does not echo the link back once the email is away", async () => {
    const state = await invite();

    expect(state).toMatchObject({ status: "success", email: "sent" });
    expect(state).toMatchObject({ setupLink: null });
  });

  /*
   * The other half of that trade-off. With no email delivered, an admin who
   * cannot see the link has no way to onboard the store at all.
   */
  it.each([
    ["email is not configured", { status: "skipped" }, "not-configured"],
    ["the provider rejected it", { status: "failed", reason: "550" }, "failed"],
  ])("hands the link to the admin when %s", async (_label, result, outcome) => {
    sendEmail.mockResolvedValue(result);

    const state = await invite();

    expect(state).toMatchObject({ email: outcome, setupLink: SETUP_LINK });
  });

  /*
   * Minting the link can fail while the store row and the auth account
   * already exist. An invitation without the shortcut still works — it falls
   * back to the route every invitation used before — so the send must not be
   * skipped, and nothing token-shaped may be invented in its place.
   */
  it("still sends the invitation when no link could be minted", async () => {
    generateLink.mockResolvedValue({ data: null, error: { message: "boom" } });

    const state = await invite();

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sentMessage().text).toContain("https://cardflare.gg/login/reset");
    expect(sentMessage().html).not.toMatch(/token=/);
    expect(state).toMatchObject({ status: "success", setupLink: null });
  });

  /*
   * A Server Action is a public POST endpoint. Gating the form gates nothing,
   * and this one mints a credential.
   */
  it("mints nothing for a caller who is not an admin", async () => {
    getViewer.mockResolvedValue({ kind: "anonymous" });

    const state = await invite();

    expect(state.status).toBe("error");
    expect(generateLink).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  /*
   * A second invitation to a pending address stops before the link is minted.
   * Otherwise the form would double as a way to mint sign-in links for any
   * address already in the beta.
   */
  it("mints nothing for an address that is already invited", async () => {
    inviteStore.mockResolvedValue({ outcome: "already-invited" });

    const state = await invite();

    expect(state.status).toBe("error");
    expect(generateLink).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
