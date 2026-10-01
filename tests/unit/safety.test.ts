import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { dropBlockedItems, withoutBlocked } from "@/lib/feed/blocks";

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

/**
 * Report and block, the safety valve the audit asked for. A block is
 * quiet and total: nothing of theirs is drawn for you, nothing of yours
 * reaches them, and neither can open a conversation with the other.
 */
describe("a blocked player leaves the Feed", () => {
  const blocked = new Set(["bad"]);

  it("drops an item they authored", () => {
    expect(withoutBlocked({ kind: "hunt", playerId: "bad" }, blocked)).toBeNull();
    expect(withoutBlocked({ kind: "hunt", playerId: "ok" }, blocked)).toEqual({
      kind: "hunt",
      playerId: "ok",
    });
  });

  it("trims them out of a list, and follows the count down", () => {
    const item = {
      kind: "wanted",
      total: 5,
      entries: [{ playerId: "bad" }, { playerId: "ok" }],
    };
    expect(withoutBlocked(item, blocked)).toEqual({
      kind: "wanted",
      total: 4,
      entries: [{ playerId: "ok" }],
    });
  });

  it("drops an item whose only people are blocked", () => {
    expect(
      withoutBlocked({ kind: "suggest", players: [{ playerId: "bad" }] }, blocked),
    ).toBeNull();
  });

  it("leaves everything alone when nobody is blocked", () => {
    const items = [
      { kind: "board", code: "X" },
      { kind: "hunt", playerId: "bad" },
    ];
    expect(dropBlockedItems(items, new Set())).toBe(items);
    expect(dropBlockedItems(items, blocked)).toEqual([{ kind: "board", code: "X" }]);
  });
});

describe("the block is total", () => {
  const threads = read("src/lib/local/threads.ts");
  const feed = read("src/lib/feed/repository.ts");
  const posts = read("src/lib/feed/posts.ts");
  const lib = read("src/lib/players/safety.ts");

  it("closes every door into a conversation, both ways, without saying which side", () => {
    expect(threads.match(/await blockedBetween\(/g)?.length).toBe(4);
    expect(threads).toContain("if (await blockedBetween(fromPlayerId, toPlayerId)) {");
    expect(lib).toContain("blocker_id.eq.${playerId},blocked_id.eq.${playerId}");
  });

  it("is applied to the Feed and to comment threads", () => {
    expect(feed).toContain("return dropBlockedItems(items, blocked).map((item) => {");
    expect(posts).toContain("!blocked.has(row.player_id)");
  });

  it("never touches follows", () => {
    expect(lib).not.toContain("player_follows");
  });
});

describe("a report", () => {
  const migration = read("supabase/migrations/20261022090000_safety.sql");
  const lib = read("src/lib/players/safety.ts");

  it("names the player behind the target and a reason from the list", () => {
    expect(migration).toContain("reason in ('spam', 'scam', 'harassment', 'other')");
    expect(migration).toContain("target_kind in ('post', 'player', 'thread')");
    expect(lib).toContain(
      'if (targetPlayerId === reporterId) return { ok: false, reason: "yourself" };',
    );
  });

  it("is admin business afterwards, and shows on the dashboard", () => {
    expect(read("src/lib/players/safety-actions.ts")).toContain(
      "export async function resolveReportAction",
    );
    expect(read("src/lib/admin/failures.ts")).toContain('kind: "report-open"');
  });
});

describe("the Feed is remembered for a moment", () => {
  it("for half a minute, and forgotten by the things that change it", () => {
    expect(read("src/lib/feed/memo.ts")).toContain("const TTL_MS = 30 * 1000;");
    expect(read("src/app/feed/page.tsx")).toContain("rememberFeed(playerId, () =>");
    for (const path of [
      "src/lib/flares/publish-actions.ts",
      "src/lib/flares/withdraw-actions.ts",
      "src/lib/players/safety-actions.ts",
    ]) {
      expect(read(path)).toContain("forgetFeed(");
    }
  });
});

describe("the poster says what the shop plays", () => {
  it("falls back to a line true of every shop", () => {
    const page = read("src/lib/stores/page.ts");
    expect(page).toContain('return "Trading card games"');
    expect(read("src/app/poster/[code]/route.ts")).toContain("storeGameLine(");
  });
});
