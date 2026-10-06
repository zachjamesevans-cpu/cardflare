import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The shared half of the rate limiter. In memory alone, every warm
 * instance kept its own count and a ceiling was really "per instance";
 * the Postgres counter makes it one ceiling for the fleet, and a
 * database that is down must not lock anybody out.
 */

const rpc = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({ rpc: (...a: unknown[]) => rpc(...a) }),
}));

const { checkRateLimit, resetRateLimits } = await import("@/lib/rate-limit");

/* Outside a request scope `after` throws and the task runs in the
   background; let it finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  resetRateLimits();
  rpc.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the shared count", () => {
  it("counts every allowed hit in Postgres", async () => {
    rpc.mockResolvedValue({ data: [{ hits: 1, resets_at: new Date().toISOString() }], error: null });
    checkRateLimit("msg:p1", 3, 60_000);
    await settle();
    expect(rpc).toHaveBeenCalledWith("rate_limit_hit", {
      p_key: "msg:p1",
      p_window_ms: 60_000,
    });
  });

  it("refuses a key the fleet has used up, though this instance has not", async () => {
    const resets = new Date(Date.now() + 30_000).toISOString();
    rpc.mockResolvedValue({ data: [{ hits: 4, resets_at: resets }], error: null });

    /* Locally this is hit one of three: allowed, and the shared count
       comes back over. */
    expect(checkRateLimit("msg:p1", 3, 60_000).allowed).toBe(true);
    await settle();

    const next = checkRateLimit("msg:p1", 3, 60_000);
    expect(next.allowed).toBe(false);
    expect(next.retryAfterSeconds).toBeGreaterThan(0);
    expect(next.retryAfterSeconds).toBeLessThanOrEqual(30);

    /* Other keys are untouched. */
    expect(checkRateLimit("msg:p2", 3, 60_000).allowed).toBe(true);
  });

  it("lets the key through again once the shared window resets", async () => {
    const resets = new Date(Date.now() + 1_000).toISOString();
    rpc.mockResolvedValue({ data: [{ hits: 9, resets_at: resets }], error: null });
    checkRateLimit("k", 3, 60_000);
    await settle();
    expect(checkRateLimit("k", 3, 60_000, Date.now()).allowed).toBe(false);
    expect(checkRateLimit("k", 3, 60_000, Date.now() + 120_000).allowed).toBe(true);
  });

  it("fails open, logged, when the database errors", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    for (let i = 0; i < 3; i += 1) {
      expect(checkRateLimit("k", 3, 60_000).allowed).toBe(true);
      await settle();
    }
    /* The in-memory half still holds the line on its own. */
    expect(checkRateLimit("k", 3, 60_000).allowed).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("fails open when the call throws outright", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    rpc.mockRejectedValue(new Error("network"));
    expect(checkRateLimit("k", 3, 60_000).allowed).toBe(true);
    await settle();
    expect(checkRateLimit("k", 3, 60_000).allowed).toBe(true);
  });
});

describe("the counter's migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261109093200_shared_rate_limits.sql"),
    "utf8",
  );

  it("is an atomic upsert behind a service-role-only definer function", () => {
    expect(sql).toContain("create or replace function public.rate_limit_hit(p_key text, p_window_ms integer)");
    expect(sql).toContain("security definer");
    expect(sql).toContain("on conflict (key, window_start) do update set hits = r.hits + 1");
    expect(sql).toContain("revoke all on function public.rate_limit_hit(text, integer) from anon;");
    expect(sql).toContain(
      "revoke all on function public.rate_limit_hit(text, integer) from authenticated;",
    );
    expect(sql).toContain("alter table public.rate_limit_hits enable row level security;");
  });
});
