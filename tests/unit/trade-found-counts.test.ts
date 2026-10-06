import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { splitFound } from "@/lib/players/found-split";

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

/**
 * Found counts move by exactly what happened, once.
 *
 * The pre-launch audit: a hunt's tick copied the request's count onto
 * every Flare posted for it, a declined conversation trade took copies
 * off a hunt it had never added to, and two room confirms at once could
 * both pay out.
 */

const flare = (id: string, quantity: number, status: string, created_at: string) => ({
  id,
  quantity,
  status,
  created_at,
});

describe("a request's found copies across its Flares", () => {
  it("shares the count out rather than giving each Flare all of it", () => {
    const split = splitFound(3, [
      flare("a", 2, "open", "2026-10-01T00:00:00Z"),
      flare("b", 2, "open", "2026-10-02T00:00:00Z"),
    ]);
    expect(split.get("a")).toBe(2);
    expect(split.get("b")).toBe(1);
  });

  it("counts the copies a trade brought against the traded Flare first", () => {
    const split = splitFound(3, [
      flare("open1", 2, "open", "2026-10-01T00:00:00Z"),
      flare("traded", 2, "traded", "2026-10-02T00:00:00Z"),
    ]);
    expect(split.get("open1")).toBe(1);
    expect(split.has("traded")).toBe(false);
  });

  it("follows an untick back down to zero", () => {
    const split = splitFound(0, [
      flare("a", 2, "open", "2026-10-01T00:00:00Z"),
      flare("b", 1, "open", "2026-10-02T00:00:00Z"),
    ]);
    expect([...split.values()]).toEqual([0, 0]);
  });

  it("never shows more on a Flare than it asked for", () => {
    const split = splitFound(10, [
      flare("a", 1, "open", "2026-10-01T00:00:00Z"),
      flare("b", 2, "open", "2026-10-02T00:00:00Z"),
    ]);
    expect(split.get("a")).toBe(1);
    expect(split.get("b")).toBe(2);
  });
});

describe("the trade remembers whether it counted", () => {
  const hunts = read("src/lib/players/hunts.ts");
  const repo = read("src/lib/trades/repository.ts");
  const thread = read("src/lib/trades/thread-trades.ts");
  const migration = read("supabase/migrations/20261109090000_in_person_play_counts.sql");

  it("claims the count once and reverses only a count it made", () => {
    const record = hunts.slice(hunts.indexOf("export async function recordTradeFound"));
    expect(record).toContain('.is("found_applied_at", null)');
    expect(record).toContain("update({ found_copies: applied })");
    const reverse = hunts.slice(hunts.indexOf("export async function reverseTradeFound"));
    expect(reverse).toContain('.not("found_applied_at", "is", null)');
    expect(reverse).toContain("claimed.found_copies");
    expect(migration).toContain("add column if not exists found_applied_at timestamptz");
  });

  it("keeps sibling Flares in step when a trade moves the request", () => {
    const add = hunts.slice(hunts.indexOf("async function addFoundCopies"));
    expect(add).toContain("await syncRequestFlares(request.id, next, now)");
  });

  it("lets only the confirm that closes the Flare count and settle", () => {
    const confirm = repo.slice(repo.indexOf("export async function confirmTrade"));
    expect(confirm).toMatch(/\.eq\("status", "open"\)\s+\.select\("id"\)/);
    expect(confirm).toContain("if (!closed) return { ok: true");
    expect(confirm).toContain("acknowledged_at: new Date().toISOString()");
  });

  it("holds one pending trade per conversation in the database", () => {
    expect(migration).toContain(
      "create unique index if not exists trades_one_pending_per_thread_idx",
    );
    expect(thread).toContain("trades_one_pending_per_thread_idx");
    expect(thread).toContain('return { ok: false, reason: "pending" }');
  });

  it("does not take copies back for a decline that never counted", () => {
    expect(repo).toContain("await reverseTradeFound(tradeId);");
    expect(thread).toContain("if (data) await recordTradeFound(tradeId);");
  });
});
