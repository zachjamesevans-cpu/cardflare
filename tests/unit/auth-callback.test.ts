import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Where a dead setup link puts somebody.
 *
 * The invitation's button is a Supabase action link and it expires — an hour
 * by default, while a shop owner reads their email the next morning. So the
 * likeliest single outcome of the most important message CardFlare sends is
 * that the button no longer works, and what happens then is not an edge case.
 *
 * It used to be `/login`, which is a dead end for exactly the person most
 * likely to arrive there: an invited store has no password yet, so a sign-in
 * form asks them for something they do not have. `/login/reset` is one field
 * away from a fresh link and works for everyone else too.
 */

const exchangeCodeForSession = vi.fn();
const claimPendingInvite = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { exchangeCodeForSession: (c: string) => exchangeCodeForSession(c) },
  }),
}));

vi.mock("@/lib/auth/session", () => ({
  claimPendingInvite: (...a: unknown[]) => claimPendingInvite(...a),
}));

const { NextRequest } = await import("next/server");
const { GET } = await import("@/app/auth/callback/route");

const EXPIRED = "https://cardflare.gg/login/reset?expired=1";

/** Follows the link, returning where the visitor ends up. */
async function follow(query: string) {
  const response = await GET(
    new NextRequest(`https://cardflare.gg/auth/callback${query}`),
  );

  return response.headers.get("location");
}

beforeEach(() => {
  exchangeCodeForSession.mockReset().mockResolvedValue({
    data: { user: { id: "u1", email: "owner@store.example" } },
    error: null,
  });
  claimPendingInvite.mockReset().mockResolvedValue(undefined);
});

describe("/auth/callback", () => {
  it("lands the store on the setup screen the invitation aimed at", async () => {
    await expect(follow("?code=abc&next=%2Fwelcome")).resolves.toBe(
      "https://cardflare.gg/welcome",
    );
  });

  /*
   * The invitation binds an address to a store before the account is used.
   * Awaited, not deferred: `/welcome` and `/store` both read the membership
   * the moment they render.
   */
  it("binds the account to its store before letting go", async () => {
    await follow("?code=abc&next=%2Fwelcome");

    expect(claimPendingInvite).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1" }),
    );
  });

  /*
   * Supabase appends its own error instead of a code for a spent or timed-out
   * link, so there is nothing to exchange and no point trying.
   */
  it.each([
    ["error_code=otp_expired", "?error_code=otp_expired&next=%2Fwelcome"],
    ["error=access_denied", "?error=access_denied&next=%2Fwelcome"],
  ])("sends a link Supabase rejected (%s) somewhere useful", async (_l, query) => {
    await expect(follow(query)).resolves.toBe(EXPIRED);
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  /*
   * Those two land at the same place a codeless link does, so the destination
   * alone does not prove the error was read. What the branch is actually for
   * is the next two assertions: a store saying "the button didn't work" is
   * answered by `otp_expired` in the logs, and not at all by "no code".
   */
  it("names Supabase's reason in the log rather than guessing", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await follow("?error=access_denied&error_code=otp_expired");

    expect(logged).toHaveBeenCalledWith(expect.any(String), "otp_expired");

    logged.mockRestore();
  });

  it("does not spend a code that arrived alongside an error", async () => {
    await expect(follow("?code=abc&error_code=otp_expired")).resolves.toBe(EXPIRED);
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("does the same when the exchange itself fails", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid flow state" },
    });

    await expect(follow("?code=stale")).resolves.toBe(EXPIRED);
  });

  it("does the same when there is no code at all", async () => {
    await expect(follow("")).resolves.toBe(EXPIRED);
  });

  /*
   * `next` rides in the query string of a link anyone can send, which is the
   * whole shape of an open redirect.
   */
  it("refuses to forward to another origin", async () => {
    await expect(
      follow("?code=abc&next=https%3A%2F%2Fevil.example%2Fsteal"),
    ).resolves.toBe("https://cardflare.gg/store");
  });
});
