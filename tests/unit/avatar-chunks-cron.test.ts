import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Abandoned app uploads: pieces under tmp/ that never got committed.
 * The sweep takes what is over an hour old and leaves a live upload
 * alone; the route fails closed without the cron secret.
 */

const NOW = Date.parse("2026-10-06T12:00:00Z");
const OLD = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();
const FRESH = new Date(NOW - 5 * 60 * 1000).toISOString();

const tree: Record<string, { name: string; created_at?: string; updated_at?: string }[]> = {
  tmp: [{ name: "p1" }],
  "tmp/p1": [{ name: "up-old" }, { name: "up-live" }],
  "tmp/p1/up-old": [
    { name: "000", updated_at: OLD },
    { name: "001", updated_at: OLD },
  ],
  "tmp/p1/up-live": [{ name: "000", updated_at: FRESH }],
};
const remove = vi.fn(async (paths: string[]) => ({ data: paths, error: null }));

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    storage: {
      from: () => ({
        list: async (prefix: string) => ({ data: tree[prefix] ?? [], error: null }),
        remove,
      }),
    },
  }),
}));

const { sweepStaleAvatarChunks } = await import("@/lib/players/avatar-chunks");
const route = await import("@/app/api/cron/avatar-chunks/route");

beforeEach(() => {
  remove.mockClear();
  vi.stubEnv("CRON_SECRET", "cron-secret-1");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sweepStaleAvatarChunks", () => {
  it("removes pieces over an hour old and leaves a live upload alone", async () => {
    expect(await sweepStaleAvatarChunks(NOW)).toEqual({ removed: 2, failed: false });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(["tmp/p1/up-old/000", "tmp/p1/up-old/001"]);
  });
});

describe("GET /api/cron/avatar-chunks", () => {
  const call = (token?: string) =>
    route.GET(
      new Request("https://cardflare.gg/api/cron/avatar-chunks", {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    );

  it("fails closed", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("wrong")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("")).status).toBe(401);
    expect(remove).not.toHaveBeenCalled();
  });

  it("runs with the secret, and is scheduled", async () => {
    expect((await call("cron-secret-1")).status).toBe(200);
    expect(readFileSync(join(process.cwd(), "vercel.json"), "utf8")).toContain(
      '"/api/cron/avatar-chunks"',
    );
  });
});
