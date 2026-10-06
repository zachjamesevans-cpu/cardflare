import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  LOGGED_NOTE_MAX,
  loggedWhen,
  logTradeSchema,
  newestFirst,
  planGave,
  reverseChanges,
  todayISO,
} from "@/lib/trades/logged-schema";

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

/**
 * A trade the player writes down themselves. The founder: "allow me to
 * enter my own trades. Like if I did something off of CardFlare." The
 * rules below are what both platforms' forms and the API hold it to.
 */
const CARD = "3f2a1b7c-9d4e-4f61-8a2b-5c6d7e8f9a0b";

describe("logging a trade", () => {
  it("needs a card, a direction and a day, and defaults the rest", () => {
    const parsed = logTradeSchema.parse({
      cardId: CARD,
      direction: "gave",
      tradedOn: "2026-09-12",
    });
    expect(parsed.quantity).toBe(1);
    expect(parsed.printingId).toBeNull();
    expect(parsed.partnerPlayerId).toBeNull();
    expect(parsed.partnerName).toBeNull();
    expect(parsed.place).toBeNull();
    expect(parsed.note).toBeNull();
    expect(parsed.updateHaveList).toBe(true);
  });

  it("turns empty boxes into nothing rather than empty strings", () => {
    const parsed = logTradeSchema.parse({
      cardId: CARD,
      direction: "got",
      tradedOn: "2026-09-12",
      partnerName: "   ",
      place: "",
      note: "",
      printingId: "",
      partnerPlayerId: "",
    });
    expect(parsed.partnerName).toBeNull();
    expect(parsed.place).toBeNull();
    expect(parsed.note).toBeNull();
    expect(parsed.printingId).toBeNull();
    expect(parsed.partnerPlayerId).toBeNull();
  });

  it("refuses a day in the future, a made-up date, and a novel for a note", () => {
    const base = { cardId: CARD, direction: "got" as const };
    expect(logTradeSchema.safeParse({ ...base, tradedOn: "2099-01-01" }).success).toBe(
      false,
    );
    expect(logTradeSchema.safeParse({ ...base, tradedOn: "2026-02-30" }).success).toBe(
      false,
    );
    expect(logTradeSchema.safeParse({ ...base, tradedOn: "yesterday" }).success).toBe(
      false,
    );
    expect(
      logTradeSchema.safeParse({
        ...base,
        tradedOn: "2026-09-12",
        note: "x".repeat(LOGGED_NOTE_MAX + 1),
      }).success,
    ).toBe(false);
  });

  it("allows today", () => {
    expect(
      logTradeSchema.safeParse({ cardId: CARD, direction: "got", tradedOn: todayISO() })
        .success,
    ).toBe(true);
  });
});

describe("where a logged trade sits in the history", () => {
  it("lands on its own day in the reader's clock, not the evening before", () => {
    /* A bare date parses as UTC midnight; noon local is the same day
       everywhere. */
    expect(new Date(loggedWhen("2026-09-12")).getDate()).toBe(12);
  });

  it("sorts among room trades newest first", () => {
    const sorted = newestFirst([
      { id: "a", confirmedAt: "2026-09-10T20:00:00Z" },
      { id: "b", confirmedAt: loggedWhen("2026-09-12") },
      { id: "c", confirmedAt: "2026-09-11T02:00:00Z" },
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["b", "c", "a"]);
  });
});

describe("the logged half of the history", () => {
  const history = read("src/lib/trades/history.ts");
  const lib = read("src/lib/trades/logged.ts");
  const migration = read("supabase/migrations/20261019100000_logged_trades.sql");

  it("marks every row with its source and pays nothing for a logged one", () => {
    expect(history).toContain('source: "room" | "conversation" | "logged"');
    expect(history).toContain('source: "logged" as const');
    expect(history).toContain("embers: 0,");
  });

  it("counts logged trades in the totals even for a free player", () => {
    expect(history).toContain("trades: room.totals.trades + logged.length");
    expect(history).toContain(
      "if (room.locked) return { locked: true, totals, trades: [] }",
    );
  });

  it("is Pro to write, by the same flag that gates reading", () => {
    expect(lib).toContain('tierAllows(tier, "tradeHistory")');
  });

  it("keeps the Have list in step unless told not to", () => {
    expect(lib).toContain("if (input.updateHaveList)");
    expect(lib).toContain("planGave(holdings, input.cardId, input.printingId, input.quantity)");
    expect(lib).toContain("delta: input.quantity");
  });

  it("undoes exactly what it did when the trade is deleted", () => {
    expect(lib).toContain('.select("binder_changes")');
    expect(lib).toContain("reverseChanges(changes)");
    const counts = read("supabase/migrations/20261109090500_in_person_play_counts.sql");
    expect(counts).toContain("create or replace function public.binder_card_adjust(");
    expect(counts).toContain("security definer");
    expect(counts).toMatch(/revoke all on function public\.binder_card_adjust[^;]+from anon/);
    expect(counts).toMatch(
      /revoke all on function public\.binder_card_adjust[^;]+from authenticated/,
    );
  });

  it("is the player's alone, in the database too", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on public.logged_trades from anon");
    expect(migration).toContain("partner_player_id <> player_id");
  });
});

describe("what a logged trade does to the binder", () => {
  const OTHER = "11111111-2222-4333-8444-555555555555";
  const holding = (
    binderId: string,
    quantity: number,
    printingId: string | null = null,
    cardId = CARD,
  ) => ({ binderId, cardId, printingId, quantity });

  it("gives away the traded copies, not every entry for the card", () => {
    const changes = planGave([holding("b1", 4)], CARD, null, 1);
    expect(changes).toEqual([
      { binder_id: "b1", card_id: CARD, printing_id: null, delta: -1 },
    ]);
  });

  it("takes the row to zero only when every copy went", () => {
    expect(planGave([holding("b1", 2)], CARD, null, 2)).toEqual([
      { binder_id: "b1", card_id: CARD, printing_id: null, delta: -2 },
    ]);
  });

  it("runs across binders, the named printing first, and never takes more than it holds", () => {
    const changes = planGave(
      [holding("b1", 1, null), holding("b2", 1, "p1"), holding("b3", 5, "p2")],
      CARD,
      "p1",
      3,
    );
    expect(changes).toEqual([
      { binder_id: "b2", card_id: CARD, printing_id: "p1", delta: -1 },
      { binder_id: "b1", card_id: CARD, printing_id: null, delta: -1 },
    ]);
  });

  it("leaves other cards alone", () => {
    expect(planGave([holding("b1", 3, null, OTHER)], CARD, null, 1)).toEqual([]);
  });

  it("reverses exactly the moves it made", () => {
    expect(
      reverseChanges([
        { binder_id: "b1", card_id: CARD, printing_id: null, delta: -2 },
        { binder_id: "b2", card_id: CARD, printing_id: "p1", delta: 3 },
        { binder_id: "b3", card_id: CARD, printing_id: null, delta: 0 },
      ]),
    ).toEqual([
      { binder_id: "b1", card_id: CARD, printing_id: null, delta: 2 },
      { binder_id: "b2", card_id: CARD, printing_id: "p1", delta: -3 },
    ]);
  });
});
