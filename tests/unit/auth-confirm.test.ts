import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The route that redeems an invitation's one-click link.
 *
 * It exists because `/auth/callback` cannot do this job: the callback
 * exchanges a PKCE code, and the verifier for that code lives in the cookies
 * of whichever browser requested the link. An invitation is minted by the
 * admin's server, so *no* browser holds the verifier — the link must work on
 * a shop owner's phone that has never touched cardflare. `verifyOtp` with the
 * hashed token asks Supabase directly and needs no prior contact.
 */

const verifyOtp = vi.fn();
const claimPendingInvite = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { verifyOtp: (...a: unknown[]) => verifyOtp(...a) },
  }),
}));

vi.mock("@/lib/auth/session", () => ({
  claimPendingInvite: (...a: unknown[]) => claimPendingInvite(...a),
}));

const { NextRequest } = await import("next/server");
const { GET, POST } = await import("@/app/auth/confirm/route");

const EXPIRED = "https://cardflare.gg/login/reset?expired=1";

/** Opens the link, returning where the visitor is sent. */
async function open(query: string) {
  const response = await GET(
    new NextRequest(`https://cardflare.gg/auth/confirm${query}`),
  );
  return response.headers.get("location");
}

/** Presses Continue, returning where the visitor ends up. */
async function press(
  fields: Record<string, string>,
  origin: string | null = "https://cardflare.gg",
) {
  const body = new URLSearchParams(fields);
  const response = await POST(
    new NextRequest("https://cardflare.gg/auth/confirm", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        host: "cardflare.gg",
        ...(origin ? { origin } : {}),
      },
    }),
  );
  return response.headers.get("location");
}

/** Opens the link, then presses Continue with what the page carries. */
async function follow(query: string) {
  const to = await open(query);
  if (!to || !to.includes("/auth/open")) return to;
  const url = new URL(to);
  return press({
    token_hash: url.searchParams.get("token_hash") ?? "",
    next: url.searchParams.get("next") ?? "",
  });
}

beforeEach(() => {
  verifyOtp.mockReset().mockResolvedValue({
    data: { user: { id: "u1", email: "owner@store.example" } },
    error: null,
  });
  claimPendingInvite.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("/auth/confirm", () => {
  /*
   * Mail scanners and link previews fetch links. When opening the link
   * redeemed it, they spent a shop owner's one-time token before the
   * owner ever tapped it.
   */
  it("spends nothing when the link is merely opened", async () => {
    const to = await open("?token_hash=abc123&type=recovery&next=%2Fwelcome");

    expect(to).toBe("https://cardflare.gg/auth/open?token_hash=abc123&next=%2Fwelcome");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(claimPendingInvite).not.toHaveBeenCalled();
  });

  it("refuses a Continue posted from another site", async () => {
    await expect(
      press({ token_hash: "abc123", next: "/welcome" }, "https://evil.example"),
    ).resolves.toBe(EXPIRED);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("lands the store on the setup screen the invitation aimed at", async () => {
    await expect(
      follow("?token_hash=abc123&type=recovery&next=%2Fwelcome"),
    ).resolves.toBe("https://cardflare.gg/welcome");
  });

  it("verifies the hashed token rather than exchanging a code", async () => {
    await follow("?token_hash=abc123&type=recovery&next=%2Fwelcome");

    expect(verifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      token_hash: "abc123",
    });
  });

  /*
   * The invitation binds an address to a store before the account is used.
   * Awaited, not deferred: `/welcome` and `/store` both read the membership
   * the moment they render.
   */
  it("binds the account to its store before letting go", async () => {
    await follow("?token_hash=abc123&type=recovery&next=%2Fwelcome");

    expect(claimPendingInvite).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1" }),
    );
  });

  it("sends a spent or timed-out token to a fresh link, not a sign-in form", async () => {
    verifyOtp.mockResolvedValue({
      data: { user: null },
      error: { message: "Token has expired or is invalid" },
    });

    await expect(
      follow("?token_hash=stale&type=recovery&next=%2Fwelcome"),
    ).resolves.toBe(EXPIRED);
  });

  /*
   * The type is pinned server-side. The token decides whether verification
   * succeeds either way; refusing other types keeps this route from becoming
   * a general-purpose verifier with behaviours nobody designed.
   */
  it.each([
    ["another type", "?token_hash=abc&type=magiclink"],
    ["a missing type", "?token_hash=abc"],
    ["a missing token", "?type=recovery"],
  ])("refuses %s without contacting Supabase", async (_label, query) => {
    await expect(follow(query)).resolves.toBe(EXPIRED);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  /*
   * `next` rides in the query string of a link anyone can forward, which is
   * the whole shape of an open redirect.
   */
  it("refuses to forward to another origin", async () => {
    await expect(
      follow("?token_hash=abc&type=recovery&next=https%3A%2F%2Fevil.example"),
    ).resolves.toBe("https://cardflare.gg/store");
  });
});
