import { describe, expect, it } from "vitest";

import { binderPrompts, type TradeRecord } from "@/lib/trades/schema";

/**
 * The after-trade binder nudge.
 *
 * The rule is one line — prompt when a holder-side trade is newer than the
 * binder entry's own confirmation — but every clause carries weight. Prompt
 * on requester-side trades and you nag people about cards they just
 * *received*; skip the null-confirmation case and an unconfirmed binder
 * entry never gets asked; compare the wrong direction and "still have it"
 * stops dismissing the prompt.
 */

const TRADE_AT = "2026-08-10T20:00:00Z";
const BEFORE = "2026-08-10T19:00:00Z";
const AFTER = "2026-08-10T21:00:00Z";

function trade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return {
    id: "trade-1",
    cardId: "card-1",
    cardName: "Sanji",
    cardNumber: "OP01-013",
    quantity: 1,
    youWere: "holder",
    partnerName: "Kaito",
    confirmedAt: TRADE_AT,
    ...overrides,
  };
}

function entry(confirmedAt: string | null, cardId = "card-1") {
  return { id: "entry-1", cardId, cardName: "Sanji", confirmedAt };
}

describe("binderPrompts", () => {
  it("prompts when the trade is newer than the entry's confirmation", () => {
    expect(binderPrompts([trade()], [entry(BEFORE)])).toEqual([
      { entryId: "entry-1", cardName: "Sanji", tradeId: "trade-1" },
    ]);
  });

  it("stays quiet once the entry has been confirmed since the trade", () => {
    expect(binderPrompts([trade()], [entry(AFTER)])).toEqual([]);
  });

  it("treats a missing confirmation as stale, not as fresh", () => {
    expect(binderPrompts([trade()], [entry(null)])).toHaveLength(1);
  });

  it("treats an unreadable confirmation as stale, not as fresh", () => {
    expect(binderPrompts([trade()], [entry("not a date")])).toHaveLength(1);
  });

  /*
   * The requester just *received* the card. Asking them whether they still
   * have it is the nudge misfiring at the one person it cannot apply to.
   */
  it("never prompts for the requester's side of a trade", () => {
    expect(binderPrompts([trade({ youWere: "requester" })], [entry(BEFORE)])).toEqual(
      [],
    );
  });

  it("only prompts for the traded card", () => {
    expect(binderPrompts([trade()], [entry(BEFORE, "other-card")])).toEqual([]);
  });

  it("prompts each stale entry once, not once per trade", () => {
    const prompts = binderPrompts(
      [trade(), trade({ id: "trade-2", confirmedAt: AFTER })],
      [entry(BEFORE)],
    );

    expect(prompts).toHaveLength(1);
  });
});
