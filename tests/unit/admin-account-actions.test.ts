import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The support desk in the console.
 *
 * These change somebody ELSE'S credentials — their username, the
 * address they sign in with, and a link that lets a stranger set their
 * password. Every one is a public POST endpoint, so the admin check is
 * re-established inside the action rather than inherited from the page
 * that drew the button.
 *
 * Untested when they shipped, which was a gap: an authorisation check
 * nobody exercises is a comment.
 */

const requireAdmin = vi.fn();
const setIdentity = vi.fn();
const updateSignInEmail = vi.fn();
const userIdForPlayer = vi.fn();
const generateSetupLink = vi.fn();
const sendEmail = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/auth/invite-link", () => ({
  generateSetupLink: (...a: unknown[]) => generateSetupLink(...a),
}));
vi.mock("@/lib/email/client", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}));
vi.mock("@/lib/email/store-invite", () => ({
  passwordResetEmail: (name: string, to: string) => ({ to, subject: `for ${name}` }),
}));
vi.mock("@/lib/admin/records", () => ({
  updateSignInEmail: (...a: unknown[]) => updateSignInEmail(...a),
  userIdForPlayer: (...a: unknown[]) => userIdForPlayer(...a),
}));
vi.mock("@/lib/players/profile", () => ({
  setIdentity: (...a: unknown[]) => setIdentity(...a),
}));
vi.mock("@/lib/site", () => ({ siteUrl: () => "https://cardflare.gg" }));

const { adminSendResetAction, adminSetEmailAction, adminSetIdentityAction } =
  await import("@/lib/players/admin-account-actions");

/* From the schema module now, not the actions — the crash this round
   fixed was exactly that constant living in a "use server" file. */
const { ADMIN_ACCOUNT_IDLE } = await import("@/lib/players/profile-schema");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: "admin-1" });
  setIdentity.mockResolvedValue("renamed");
  userIdForPlayer.mockResolvedValue("user-1");
  updateSignInEmail.mockResolvedValue({ ok: true });
  generateSetupLink.mockResolvedValue("https://cardflare.gg/auth/confirm?token_hash=x");
  sendEmail.mockResolvedValue({ status: "sent", id: "e1" });
});

describe("changing a username", () => {
  it("saves the name and the handle together", async () => {
    const state = await adminSetIdentityAction(
      ADMIN_ACCOUNT_IDLE,
      form({ playerId: "p1", displayName: "Steven B", handle: "steven_b" }),
    );

    expect(setIdentity).toHaveBeenCalledWith("p1", "Steven B", "steven_b");
    expect(state.status).toBe("done");
  });

  it("says who they are now, so the console can be believed", async () => {
    const state = await adminSetIdentityAction(
      ADMIN_ACCOUNT_IDLE,
      form({ playerId: "p1", displayName: "Steven B", handle: "stevo" }),
    );

    expect(state.status === "done" && state.message).toContain("@stevo");
  });

  it("names the collision rather than failing vaguely", async () => {
    /* The handle is the one field that still has to be unique, so
       "taken" is the answer an admin will actually hit. */
    setIdentity.mockResolvedValue("taken");

    const state = await adminSetIdentityAction(
      ADMIN_ACCOUNT_IDLE,
      form({ playerId: "p1", displayName: "Steven B", handle: "zach" }),
    );

    expect(state.status).toBe("error");
    expect(state.status === "error" && state.message).toContain("already has that");
  });

  it.each([
    ["a handle with a space", { displayName: "Steven B", handle: "steven b" }],
    ["a handle with punctuation", { displayName: "Steven B", handle: "steven.b!" }],
    ["an empty name", { displayName: "   ", handle: "steven_b" }],
  ])("refuses %s before it reaches the database", async (_case, fields) => {
    const state = await adminSetIdentityAction(
      ADMIN_ACCOUNT_IDLE,
      form({ playerId: "p1", ...fields }),
    );

    expect(state.status).toBe("error");
    expect(setIdentity).not.toHaveBeenCalled();
  });

  it("refuses a request with no player at all", async () => {
    const state = await adminSetIdentityAction(
      ADMIN_ACCOUNT_IDLE,
      form({ playerId: "", displayName: "Steven B", handle: "steven_b" }),
    );

    expect(state.status).toBe("error");
    expect(setIdentity).not.toHaveBeenCalled();
  });

  it("asks whether the caller is an admin, every time", async () => {
    await adminSetIdentityAction(
      ADMIN_ACCOUNT_IDLE,
      form({ playerId: "p1", displayName: "Steven B", handle: "steven_b" }),
    );

    expect(requireAdmin).toHaveBeenCalled();
  });

  it("stops when the caller is not an admin", async () => {
    /* `requireAdmin` redirects, which throws. Nothing after it runs. */
    requireAdmin.mockRejectedValue(
      Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT" }),
    );

    await expect(
      adminSetIdentityAction(
        ADMIN_ACCOUNT_IDLE,
        form({ playerId: "p1", displayName: "Steven B", handle: "steven_b" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(setIdentity).not.toHaveBeenCalled();
  });
});

describe("changing the sign-in address", () => {
  it("goes through the same helper the store console uses", async () => {
    const state = await adminSetEmailAction(
      ADMIN_ACCOUNT_IDLE,
      form({ playerId: "p1", email: " Them@Example.COM " }),
    );

    /* Normalised on the way in: an address that differs by case is the
       same address, and auth will disagree if we do not say so. */
    expect(updateSignInEmail).toHaveBeenCalledWith("user-1", "them@example.com");
    expect(state.status).toBe("done");
  });

  it("names a taken address rather than shrugging", async () => {
    updateSignInEmail.mockResolvedValue({ ok: false, reason: "email-taken" });

    const state = await adminSetEmailAction(
      ADMIN_ACCOUNT_IDLE,
      form({ playerId: "p1", email: "taken@example.com" }),
    );

    expect(state.status === "error" && state.message).toContain("already uses");
  });

  it.each(["", "not-an-email", "a@b"])("refuses %j", async (email) => {
    const state = await adminSetEmailAction(
      ADMIN_ACCOUNT_IDLE,
      form({ playerId: "p1", email }),
    );

    expect(state.status).toBe("error");
    expect(updateSignInEmail).not.toHaveBeenCalled();
  });

  it("says plainly when the account has no sign-in yet", async () => {
    userIdForPlayer.mockResolvedValue(null);

    const state = await adminSetEmailAction(
      ADMIN_ACCOUNT_IDLE,
      form({ playerId: "p1", email: "them@example.com" }),
    );

    expect(state.status).toBe("error");
    expect(updateSignInEmail).not.toHaveBeenCalled();
  });
});

describe("sending a password link", () => {
  it("mints a link and emails it", async () => {
    const state = await adminSendResetAction(
      ADMIN_ACCOUNT_IDLE,
      form({ playerId: "p1", email: "them@example.com", displayName: "Savannah" }),
    );

    expect(generateSetupLink).toHaveBeenCalledWith("them@example.com");
    expect(sendEmail).toHaveBeenCalled();
    expect(state.status).toBe("done");
  });

  it("does not claim to have sent anything when email is not configured", async () => {
    /* A deployment with no mail provider would otherwise tell an admin a
       link went out, and they would tell the player. */
    sendEmail.mockResolvedValue({ status: "skipped", reason: "not-configured" });

    const state = await adminSendResetAction(
      ADMIN_ACCOUNT_IDLE,
      form({ playerId: "p1", email: "them@example.com", displayName: "Savannah" }),
    );

    expect(state.status).toBe("error");
    expect(state.status === "error" && state.message).toContain("not configured");
  });

  it("says the link was made when only the sending failed", async () => {
    sendEmail.mockResolvedValue({ status: "failed", reason: "provider down" });

    const state = await adminSendResetAction(
      ADMIN_ACCOUNT_IDLE,
      form({ playerId: "p1", email: "them@example.com", displayName: "Savannah" }),
    );

    expect(state.status).toBe("error");
    expect(state.status === "error" && state.message).toContain("did not send");
  });

  it("refuses when there is no address on file", async () => {
    const state = await adminSendResetAction(
      ADMIN_ACCOUNT_IDLE,
      form({ playerId: "p1", email: "", displayName: "Savannah" }),
    );

    expect(state.status).toBe("error");
    expect(generateSetupLink).not.toHaveBeenCalled();
  });
});
