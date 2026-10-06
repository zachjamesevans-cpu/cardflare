import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { tradeFailureMessage } from "@/lib/trades/thread-trade-copy";

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

/**
 * "We traded", said in a conversation. The audit: "zero confirmed
 * trades in 30 days suggests confirming is too hard, and confirming is
 * the only way to earn Embers." A trade may now be confirmed where it
 * was arranged, by either side, and pays under the room's rules.
 */
describe("a trade confirmed in a conversation", () => {
  const migration = read("supabase/migrations/20261023090000_thread_trades.sql");
  const lib = read("src/lib/trades/thread-trades.ts");

  it("happens somewhere: a room or a conversation, never neither", () => {
    expect(migration).toContain("alter column event_id drop not null");
    expect(migration).toContain(
      "check (event_id is not null or thread_id is not null)",
    );
    expect(migration).toContain("or requester_player_id <> holder_player_id");
  });

  it("is one side's word until the other answers, one at a time", () => {
    expect(lib).toContain('if (open) return { ok: false, reason: "pending" };');
    expect(lib).toContain("proposed_by: viewerId,");
    /* Your own claim is not yours to confirm. */
    expect(lib).toContain(
      'if (trade.proposed_by === viewerId) return { ok: false, reason: "not-found" };',
    );
  });

  it("uses an old anchor's card unless one was picked, and asks for one on a direct message", () => {
    expect(lib).toContain("if (thread.flare_id && !input.cardId) {");
    expect(lib).toContain("} else if (thread.want_id && !input.cardId) {");
    expect(lib).toContain(
      'if (!input.cardId) return { ok: false, reason: "no-card" };',
    );
  });

  it("closes the Flare only once its own author has a hand on it", () => {
    expect(lib).toContain(
      "if (flareId && authorSaid) await closeFlareAsTraded(flareId, inserted.id);",
    );
    expect(lib).toContain(
      "if (trade.flare_id && trade.requester_player_id === viewerId) {",
    );
    /* One trade per Flare, whichever place it was confirmed in. */
    expect(lib).toContain('if (error?.code === "23505") {');
    expect(lib).toContain('return { ok: false, reason: "already-traded" };');
  });

  it("pays by the room's rules, with the pair counted by account too", () => {
    const embers = read("src/lib/players/embers.ts");
    expect(lib).toContain('await awardTradeEmbers(tradeId, "acknowledged");');
    expect(embers).toContain('.eq("requester_player_id", from)');
    expect(embers).toContain("const claimant = trade.proposed_by ?? requester;");
    expect(embers).toContain("if (!eventId || sessions.length === 0) return 0;");
  });

  it("shows in the trade history as its own kind, and is reversed with the account", () => {
    const history = read("src/lib/trades/history.ts");
    expect(history).toContain('source: "room" | "conversation" | "logged";');
    expect(history).toContain("`requester_player_id.eq.${playerId}`");
    expect(read("src/lib/admin/deletion.ts")).toContain(
      "`holder_player_id.eq.${playerId}`",
    );
  });

  it("rides the thread read, and the app has the same two doors", () => {
    expect(read("src/lib/local/threads.ts")).toContain(
      "latestThreadTrade(conversationId, viewerId).catch(() => null),",
    );
    const route = read("src/app/api/v1/local/threads/[threadId]/trade/route.ts");
    expect(route).toContain("export async function POST");
    expect(route).toContain("export async function PATCH");
    expect(route).toContain('answer: z.enum(["yes", "no"])');
  });

  it("says why it refused, in words", () => {
    expect(tradeFailureMessage("pending")).toBe(
      "One trade at a time. Wait for their answer first.",
    );
    expect(tradeFailureMessage("no-card")).toBe("Pick a card from the list.");
    expect(tradeFailureMessage("unavailable")).toContain("Something went wrong");
  });
});

describe("the admin activity page", () => {
  it("reads only what the product already logged", () => {
    const lib = read("src/lib/admin/player-timeline.ts");
    for (const table of [
      "event_participants",
      "flares",
      "flare_posts",
      "hunts",
      "trades",
      "flare_messages",
      "player_reports",
      "player_blocks",
      "ember_ledger",
    ]) {
      expect(lib).toContain(`.from("${table}")`);
    }
    expect(lib).not.toContain(".insert(");
    expect(lib).not.toContain(".update(");
  });
});
