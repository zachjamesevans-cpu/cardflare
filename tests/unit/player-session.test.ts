import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => false,
  getSupabaseAdmin: () => {
    throw new Error("not used in this test");
  },
}));

const { createSessionToken, hashSessionToken, tokenHashesMatch } =
  await import("@/lib/players/session");

describe("createSessionToken", () => {
  /*
   * This token is the entire credential — a guest has no account to check it
   * against, so possession is the authorisation. It has to come from a CSPRNG
   * and be long enough that guessing is hopeless.
   */
  it("produces at least 256 bits of entropy", () => {
    const token = createSessionToken();

    // 32 bytes base64url-encoded, unpadded.
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("is URL-safe, so it survives a cookie round trip unescaped", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(createSessionToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 500 }, createSessionToken));

    expect(tokens.size).toBe(500);
  });
});

describe("hashSessionToken", () => {
  it("returns lowercase hex matching the column constraint", () => {
    expect(hashSessionToken("anything")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for the same token", () => {
    const token = createSessionToken();

    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("differs for different tokens", () => {
    expect(hashSessionToken("a")).not.toBe(hashSessionToken("b"));
  });

  /*
   * The point of hashing: a leak of the table must not hand over the ability
   * to resume anyone's session.
   */
  it("does not contain the token it was derived from", () => {
    const token = createSessionToken();

    expect(hashSessionToken(token)).not.toContain(token);
  });
});

describe("tokenHashesMatch", () => {
  it("matches identical hashes", () => {
    const hash = hashSessionToken("x");

    expect(tokenHashesMatch(hash, hash)).toBe(true);
  });

  it("rejects different hashes", () => {
    expect(tokenHashesMatch(hashSessionToken("a"), hashSessionToken("b"))).toBe(false);
  });

  // timingSafeEqual throws on a length mismatch rather than returning false.
  it("returns false rather than throwing on a length mismatch", () => {
    expect(() => tokenHashesMatch("short", hashSessionToken("a"))).not.toThrow();
    expect(tokenHashesMatch("short", hashSessionToken("a"))).toBe(false);
  });
});
