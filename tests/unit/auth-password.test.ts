import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Password sign-in, and the things about it that must not leak.
 *
 * Adding passwords to a beta whose whole membership model is "an admin invited
 * you" creates a new way to ask "is this store in the beta?" — and a wrong
 * answer here is not a broken page, it is a list of pilot stores handed to
 * whoever asked. Most of what follows is about that: one message for every
 * kind of failure, and a limit that survives an attacker who varies either the
 * address or the network.
 */

const signInWithPassword = vi.fn();
const resetPasswordForEmail = vi.fn();
const updateUser = vi.fn();
const signInWithOAuth = vi.fn();
const getUser = vi.fn();
const claimPendingInvite = vi.fn();
const redirect = vi.fn((path: string) => {
  // Next's redirect throws to unwind; mirroring that keeps the actions honest.
  throw new Error(`REDIRECT:${path}`);
});

vi.mock("next/navigation", () => ({ redirect: (p: string) => redirect(p) }));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => clientIp }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => supabaseConfigured,
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: null }) }) }),
      }),
    }),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      signInWithPassword: (...a: unknown[]) => signInWithPassword(...a),
      resetPasswordForEmail: (...a: unknown[]) => resetPasswordForEmail(...a),
      updateUser: (...a: unknown[]) => updateUser(...a),
      signInWithOAuth: (...a: unknown[]) => signInWithOAuth(...a),
      getUser: () => getUser(),
    },
  }),
}));

vi.mock("@/lib/auth/session", () => ({
  claimPendingInvite: (...a: unknown[]) => claimPendingInvite(...a),
}));

let clientIp = "203.0.113.7";
let supabaseConfigured = true;

const {
  signInWithPassword: action,
  requestPasswordReset,
  updatePassword,
} = await import("@/lib/auth/actions");
const { PASSWORD_SIGN_IN_IDLE, RESET_REQUEST_IDLE, NEW_PASSWORD_IDLE } =
  await import("@/lib/auth/state");
const { PASSWORD_MIN, PASSWORD_MAX } = await import("@/lib/auth/schema");
const { resetRateLimits } = await import("@/lib/rate-limit");

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const credentials = (over: Record<string, string> = {}) =>
  form({ email: "owner@store.example", password: "correct horse battery", ...over });

/** Runs an action that is expected to redirect, and returns where to. */
async function redirectsTo(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith("REDIRECT:")) return message.slice("REDIRECT:".length);
    throw error;
  }

  throw new Error("Expected a redirect and did not get one.");
}

beforeEach(() => {
  for (const fn of [
    signInWithPassword,
    resetPasswordForEmail,
    updateUser,
    signInWithOAuth,
    getUser,
    claimPendingInvite,
    redirect,
  ]) {
    fn.mockClear();
  }

  clientIp = "203.0.113.7";
  supabaseConfigured = true;
  resetRateLimits();

  signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  resetPasswordForEmail.mockResolvedValue({ error: null });
  updateUser.mockResolvedValue({ error: null });
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  claimPendingInvite.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("signInWithPassword", () => {
  it("signs in and lands on the store dashboard", async () => {
    const to = await redirectsTo(() => action(PASSWORD_SIGN_IN_IDLE, credentials()));

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "owner@store.example",
      password: "correct horse battery",
    });
    expect(to).toBe("/store");
  });

  it("honours a safe next path", async () => {
    const to = await redirectsTo(() =>
      action(PASSWORD_SIGN_IN_IDLE, credentials({ next: "/admin" })),
    );

    expect(to).toBe("/admin");
  });

  /*
   * `safeNextPath` is what stops the sign-in flow becoming an open redirect —
   * a phishing page reached through a genuine cardflare.gg link. Checked here
   * as well as in its own tests because this is the action that uses it.
   */
  it("refuses to be turned into an open redirect", async () => {
    for (const next of ["https://evil.example", "//evil.example", "/\\evil.example"]) {
      resetRateLimits();
      const to = await redirectsTo(() =>
        action(PASSWORD_SIGN_IN_IDLE, credentials({ next })),
      );

      expect(to).toBe("/store");
    }
  });

  it("binds an invited account to its store on the way in", async () => {
    await redirectsTo(() => action(PASSWORD_SIGN_IN_IDLE, credentials()));

    expect(claimPendingInvite).toHaveBeenCalledWith({ id: "u1" });
  });

  it("normalises the address, so casing cannot split an account", async () => {
    await redirectsTo(() =>
      action(PASSWORD_SIGN_IN_IDLE, credentials({ email: "  Owner@Store.Example " })),
    );

    expect(signInWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({ email: "owner@store.example" }),
    );
  });

  /*
   * The oracle test. A wrong password, an address with no account, and an
   * account that has never set a password are three different facts, and the
   * form must reveal none of them.
   */
  it("says exactly the same thing however the attempt failed", async () => {
    const messages = new Set<string>();

    for (const failure of [
      { data: { user: null }, error: { message: "Invalid login credentials" } },
      { data: { user: null }, error: { message: "Email not confirmed" } },
      { data: { user: null }, error: null },
    ]) {
      resetRateLimits();
      signInWithPassword.mockResolvedValue(failure);

      const state = await action(PASSWORD_SIGN_IN_IDLE, credentials());

      expect(state.status).toBe("error");
      if (state.status === "error") messages.add(state.message);
    }

    expect(messages.size).toBe(1);
  });

  it("never repeats Supabase's own wording back to the user", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    });

    const state = await action(PASSWORD_SIGN_IN_IDLE, credentials());

    expect(state.status === "error" && state.message).not.toMatch(/invalid login/i);
  });

  it("hands the email back so a rejected attempt need not be retyped", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "nope" },
    });

    const state = await action(PASSWORD_SIGN_IN_IDLE, credentials());

    expect(state.status === "error" && state.email).toBe("owner@store.example");
  });

  it("never hands the password back", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "nope" },
    });

    const state = await action(PASSWORD_SIGN_IN_IDLE, credentials());

    expect(JSON.stringify(state)).not.toContain("correct horse battery");
  });

  it("stops a run of guesses from one network", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "nope" },
    });

    let blocked = false;
    for (let i = 0; i < 30; i += 1) {
      const state = await action(
        PASSWORD_SIGN_IN_IDLE,
        credentials({ email: `person${i}@store.example` }),
      );
      if (state.status === "error" && /too many/i.test(state.message)) blocked = true;
    }

    expect(blocked).toBe(true);
  });

  /*
   * The per-address bucket. A per-IP limit alone does nothing about a botnet
   * spread across many addresses all guessing at one known store owner, which
   * is the likelier attack once real accounts have real passwords.
   */
  it("stops a run of guesses at one account from many networks", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "nope" },
    });

    let blocked = false;
    for (let i = 0; i < 30; i += 1) {
      clientIp = `198.51.100.${i}`;
      const state = await action(PASSWORD_SIGN_IN_IDLE, credentials());
      if (state.status === "error" && /too many/i.test(state.message)) blocked = true;
    }

    expect(blocked).toBe(true);
  });

  it("does not reach the auth server when nothing is configured", async () => {
    supabaseConfigured = false;

    const state = await action(PASSWORD_SIGN_IN_IDLE, credentials());

    expect(state.status).toBe("error");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("rejects a malformed address before any network call", async () => {
    const state = await action(
      PASSWORD_SIGN_IN_IDLE,
      credentials({ email: "not-an-email" }),
    );

    expect(state.status === "error" && state.fieldErrors.email).toBeTruthy();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  /* bcrypt truncates past 72 bytes, so anything longer is refused outright. */
  it("refuses a password longer than bcrypt would actually check", async () => {
    const state = await action(
      PASSWORD_SIGN_IN_IDLE,
      credentials({ password: "x".repeat(PASSWORD_MAX + 1) }),
    );

    expect(state.status === "error" && state.fieldErrors.password).toBeTruthy();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  /*
   * A sign-in form must not comment on the shape of the password typed at it:
   * "too short" is a fact about the stored one.
   */
  it("does not tell anyone their guess was too short", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "nope" },
    });

    const state = await action(PASSWORD_SIGN_IN_IDLE, credentials({ password: "a" }));

    expect(state.status === "error" && state.message).not.toMatch(/short|characters/i);
    expect(signInWithPassword).toHaveBeenCalled();
  });
});

describe("requestPasswordReset", () => {
  it("sends people back to the password page after the link", async () => {
    await requestPasswordReset(RESET_REQUEST_IDLE, form({ email: "a@b.example" }));

    const [, options] = resetPasswordForEmail.mock.calls[0];

    expect(options.redirectTo).toContain("/auth/callback");
    expect(decodeURIComponent(options.redirectTo)).toContain("next=/profile/password");
  });

  /* The same oracle rule as sign-in: an unknown address looks identical. */
  it("reports success whether or not the address exists", async () => {
    const first = await requestPasswordReset(
      RESET_REQUEST_IDLE,
      form({ email: "known@b.example" }),
    );

    resetPasswordForEmail.mockResolvedValue({ error: { message: "User not found" } });

    const second = await requestPasswordReset(
      RESET_REQUEST_IDLE,
      form({ email: "unknown@b.example" }),
    );

    expect(first).toEqual({ status: "sent" });
    expect(second).toEqual({ status: "sent" });
  });

  it("rejects a malformed address without sending anything", async () => {
    const state = await requestPasswordReset(RESET_REQUEST_IDLE, form({ email: "x" }));

    expect(state.status).toBe("error");
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    let blocked = false;
    for (let i = 0; i < 20; i += 1) {
      const state = await requestPasswordReset(
        RESET_REQUEST_IDLE,
        form({ email: `p${i}@b.example` }),
      );
      if (state.status === "error") blocked = true;
    }

    expect(blocked).toBe(true);
  });
});

describe("updatePassword", () => {
  const strong = "correct horse battery staple";

  it("saves a password that meets the rules", async () => {
    const state = await updatePassword(
      NEW_PASSWORD_IDLE,
      form({ password: strong, confirm: strong }),
    );

    expect(updateUser).toHaveBeenCalledWith({ password: strong });
    expect(state.status).toBe("saved");
  });

  it("requires the two entries to match", async () => {
    const state = await updatePassword(
      NEW_PASSWORD_IDLE,
      form({ password: strong, confirm: `${strong}!` }),
    );

    expect(state.status === "error" && state.fieldErrors.confirm).toBeTruthy();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("enforces the minimum length", async () => {
    const short = "a".repeat(PASSWORD_MIN - 1);

    const state = await updatePassword(
      NEW_PASSWORD_IDLE,
      form({ password: short, confirm: short }),
    );

    expect(state.status === "error" && state.fieldErrors.password).toBeTruthy();
    expect(updateUser).not.toHaveBeenCalled();
  });

  /*
   * The session is the authorisation — `updateUser` acts on whoever the cookie
   * says you are. No session must stop here rather than producing a confusing
   * failure deeper in.
   */
  it("refuses when the session has gone", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const state = await updatePassword(
      NEW_PASSWORD_IDLE,
      form({ password: strong, confirm: strong }),
    );

    expect(state.status).toBe("error");
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("reports a rejection from the auth server rather than claiming success", async () => {
    updateUser.mockResolvedValue({
      error: { message: "Password is known to be weak and easy to guess" },
    });

    const state = await updatePassword(
      NEW_PASSWORD_IDLE,
      form({ password: strong, confirm: strong }),
    );

    expect(state.status).toBe("error");
    expect(state.status === "error" && state.message).toMatch(/weak/i);
  });
});
