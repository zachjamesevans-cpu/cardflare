import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The one-click invitation, end to end through the Server Action.
 *
 * Inviting a store used to send an email whose only job was to point at a
 * form, which asked for the address that email had just been sent to, so that
 * a *second* email could carry the link that actually did something. This
 * covers the replacement: a real Supabase action link, minted server-side and
 * carried by CardFlare's own invitation.
 *
 * Supabase is mocked at the admin client rather than at `generateSetupLink`,
 * so the arguments we send Supabase are part of what is under test. Two of
 * them are easy to get wrong and silent when wrong: `type` must be `recovery`
 * (an `invite` link creates the user and fails on the one `ensureAuthUser`
 * has already made), and `redirectTo` must be the callback, since Supabase
 * drops a `redirectTo` it does not recognise without raising.
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

const ACTION_LINK =
  "https://project.supabase.co/auth/v1/verify?token=abc123&type=recovery";

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
    data: { properties: { action_link: ACTION_LINK } },
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
  it("returns the action link Supabase minted", async () => {
    await expect(generateSetupLink("owner@grandlinegames.com")).resolves.toBe(
      ACTION_LINK,
    );
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
   * the callback that turns the token into a session. Sent anywhere else it
   * signs them in and drops them somewhere with no password field.
   */
  it("sends the store to the callback, bound for the setup screen", async () => {
    await generateSetupLink("owner@grandlinegames.com");

    const { options } = generateLink.mock.calls[0][0];

    expect(options.redirectTo).toBe(
      "https://cardflare.gg/auth/callback?next=%2Fwelcome",
    );
  });

  it.each([
    ["Supabase errors", { data: null, error: { message: "boom" } }],
    ["the response carries no link", { data: { properties: {} }, error: null }],
  ])("returns null when %s", async (_label, response) => {
    generateLink.mockResolvedValue(response);

    await expect(generateSetupLink("owner@grandlinegames.com")).resolves.toBeNull();
  });
});

describe("inviteStoreAction", () => {
  it("puts the one-click link in the email it sends", async () => {
    await invite();

    expect(sentMessage().text).toContain(ACTION_LINK);
    expect(sentMessage().html).toContain(ACTION_LINK);
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

    expect(state).toMatchObject({ email: outcome, setupLink: ACTION_LINK });
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
