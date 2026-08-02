import { beforeEach, describe, expect, it, vi } from "vitest";

const createUser = vi.fn();
const inviteSelect = vi.fn();
const signInWithOtp = vi.fn();

/**
 * The bug these cover.
 *
 * Sign-in sends a magic link with `shouldCreateUser: false`, and inviting a
 * store only ever wrote `stores` and `store_invites` rows. Nothing in the
 * codebase created a Supabase auth account, so Supabase had nothing to send a
 * link to and sent nothing — while the sign-in form said "check your email",
 * because it says that to everyone on purpose so the form cannot be used to
 * discover who is in the beta.
 *
 * The result was a store flow that could never complete, hidden behind a
 * deliberately uninformative success message. Found only when a real store
 * tried it.
 */

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    auth: { admin: { createUser: (...a: unknown[]) => createUser(...a) } },
    from: () => ({
      select: () => ({
        eq: () => ({ is: () => ({ maybeSingle: () => inviteSelect() }) }),
      }),
    }),
  }),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => "203.0.113.7" }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { signInWithOtp: (...a: unknown[]) => signInWithOtp(...a) },
  }),
}));

const { ensureAuthUser } = await import("@/lib/auth/provision");
const { requestSignInLink } = await import("@/lib/auth/actions");
const { resetRateLimits } = await import("@/lib/rate-limit");

function formData(email: string) {
  const data = new FormData();
  data.set("email", email);
  return data;
}

beforeEach(() => {
  resetRateLimits();
  createUser.mockReset().mockResolvedValue({ error: null });
  inviteSelect.mockReset().mockResolvedValue({ data: null, error: null });
  signInWithOtp.mockReset().mockResolvedValue({ error: null });
});

describe("ensureAuthUser", () => {
  it("creates a confirmed account, so a magic link can actually be sent", () => {
    ensureAuthUser("owner@store.gg");

    expect(createUser).toHaveBeenCalledWith({
      email: "owner@store.gg",
      // Without this Supabase wants a separate confirmation before it will
      // send a link, which is the same dead end wearing a different hat.
      email_confirm: true,
    });
  });

  /* One person can run two stores, and a store can be re-invited. */
  it("treats an existing account as success", async () => {
    for (const message of [
      "A user with this email address has already been registered",
      "email_exists",
      "User already exists",
    ]) {
      createUser.mockResolvedValue({ error: { message, status: 400 } });
      await expect(ensureAuthUser("owner@store.gg")).resolves.toBe(true);
    }

    createUser.mockResolvedValue({ error: { message: "whatever", status: 422 } });
    await expect(ensureAuthUser("owner@store.gg")).resolves.toBe(true);
  });

  it("reports a genuine failure rather than swallowing it", async () => {
    createUser.mockResolvedValue({
      error: { message: "service unavailable", status: 503 },
    });

    await expect(ensureAuthUser("owner@store.gg")).resolves.toBe(false);
  });
});

describe("requesting a sign-in link", () => {
  const request = (email: string) =>
    requestSignInLink({ status: "idle" }, formData(email));

  /*
   * The recovery path for every store invited before the invite provisioned an
   * account. Without it they stay permanently unable to sign in.
   */
  it("provisions an account for an address with an invitation still open", async () => {
    inviteSelect.mockResolvedValue({ data: { id: "invite-1" }, error: null });

    await request("owner@store.gg");

    expect(createUser).toHaveBeenCalled();
    expect(signInWithOtp).toHaveBeenCalled();
  });

  /*
   * The property that makes `shouldCreateUser: false` worth keeping. Typing an
   * address into this form must never bring an account into existence.
   */
  it("creates nothing for an address nobody invited", async () => {
    inviteSelect.mockResolvedValue({ data: null, error: null });

    await request("stranger@example.com");

    expect(createUser).not.toHaveBeenCalled();
  });

  it("still refuses to let sign-in create the account itself", async () => {
    await request("owner@store.gg");

    expect(signInWithOtp.mock.calls[0]![0]).toMatchObject({
      options: { shouldCreateUser: false },
    });
  });

  /* The response must not become an oracle for who has been invited. */
  it("answers identically whether or not an invitation exists", async () => {
    inviteSelect.mockResolvedValue({ data: { id: "invite-1" }, error: null });
    const invited = await request("owner@store.gg");

    resetRateLimits();
    inviteSelect.mockResolvedValue({ data: null, error: null });
    const stranger = await request("stranger@example.com");

    expect(invited).toEqual(stranger);
  });

  it("does not fall over when the invite lookup fails", async () => {
    inviteSelect.mockResolvedValue({ data: null, error: { message: "down" } });

    await expect(request("owner@store.gg")).resolves.toMatchObject({
      status: "sent",
    });
    expect(createUser).not.toHaveBeenCalled();
  });
});
