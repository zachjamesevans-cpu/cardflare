import { describe, expect, it } from "vitest";

import {
  EMBERS_NEW_PARTNER,
  EMBERS_REPEAT_PARTNER,
  EMBERS_UNNAMED_PARTNER,
  EMBER_TIERS,
  emberTier,
  embersForTrade,
  purchaseRef,
  toNextTier,
  tradeAwardRef,
} from "@/lib/players/ember-rules";

/**
 * The economy's arithmetic, on its own.
 *
 * These are the rules the founder chose option by option — only a
 * confirmed trade earns, the currency is Embers, and the lifetime total
 * is a public badge while the balance is private — expressed as the
 * smallest thing that can be wrong.
 */

describe("embersForTrade", () => {
  it("pays the most for meeting somebody new", () => {
    expect(embersForTrade({ partnerKnown: true, tradedBefore: false })).toBe(
      EMBERS_NEW_PARTNER,
    );
  });

  it("tapers a repeat partner, so two friends cannot farm the badge", () => {
    expect(embersForTrade({ partnerKnown: true, tradedBefore: true })).toBe(
      EMBERS_REPEAT_PARTNER,
    );
    expect(EMBERS_REPEAT_PARTNER).toBeLessThan(EMBERS_NEW_PARTNER);
  });

  it("still pays something for a repeat, because regulars are a real night", () => {
    expect(EMBERS_REPEAT_PARTNER).toBeGreaterThan(0);
  });

  it("pays less when nobody was named, because nothing corroborates it", () => {
    expect(embersForTrade({ partnerKnown: false, tradedBefore: false })).toBe(
      EMBERS_UNNAMED_PARTNER,
    );
    expect(EMBERS_UNNAMED_PARTNER).toBeLessThan(EMBERS_NEW_PARTNER);
  });

  it("ignores the history when there is no partner to have a history with", () => {
    expect(embersForTrade({ partnerKnown: false, tradedBefore: true })).toBe(
      embersForTrade({ partnerKnown: false, tradedBefore: false }),
    );
  });

  it("never pays a negative amount", () => {
    for (const partnerKnown of [true, false]) {
      for (const tradedBefore of [true, false]) {
        expect(embersForTrade({ partnerKnown, tradedBefore })).toBeGreaterThan(0);
      }
    }
  });
});

describe("idempotency keys", () => {
  /*
   * The award key carries the player as well as the trade, because a
   * confirmed trade pays BOTH sides and each side needs its own ledger
   * row. Keyed on the trade alone, the second player would collide with
   * the first and silently earn nothing.
   */
  it("gives each side of one trade its own key", () => {
    expect(tradeAwardRef("trade-1", "player-a")).not.toBe(
      tradeAwardRef("trade-1", "player-b"),
    );
  });

  it("gives the same side of the same trade the same key every time", () => {
    expect(tradeAwardRef("trade-1", "player-a")).toBe(
      tradeAwardRef("trade-1", "player-a"),
    );
  });

  it("keys a purchase to the buyer and the item", () => {
    expect(purchaseRef("player-a", "prism-holo")).toBe("purchase:player-a:prism-holo");
    expect(purchaseRef("player-a", "prism-holo")).not.toBe(
      purchaseRef("player-b", "prism-holo"),
    );
  });
});

describe("emberTier", () => {
  it("starts everybody on the first rung rather than off the ladder", () => {
    expect(emberTier(0)).toBe(EMBER_TIERS[0].name);
  });

  it("names the tier a total sits in, not the one it is heading for", () => {
    expect(emberTier(49)).toBe("Spark");
    expect(emberTier(50)).toBe("Kindling");
    expect(emberTier(199)).toBe("Kindling");
    expect(emberTier(200)).toBe("Blaze");
  });

  it("holds at the top tier however far past it a total goes", () => {
    const top = EMBER_TIERS[EMBER_TIERS.length - 1];
    expect(emberTier(top.at)).toBe(top.name);
    expect(emberTier(top.at * 10)).toBe(top.name);
  });

  it("only ever moves up as the total rises", () => {
    let seen = 0;
    for (let earned = 0; earned <= 2000; earned += 1) {
      const index = EMBER_TIERS.findIndex((step) => step.name === emberTier(earned));
      expect(index).toBeGreaterThanOrEqual(seen);
      seen = index;
    }
  });
});

describe("toNextTier", () => {
  it("says how far the next rung is", () => {
    expect(toNextTier(0)).toEqual({ name: "Kindling", needed: 50 });
    expect(toNextTier(49)).toEqual({ name: "Kindling", needed: 1 });
  });

  it("returns null at the top, so nothing promises a rung that is not there", () => {
    const top = EMBER_TIERS[EMBER_TIERS.length - 1];
    expect(toNextTier(top.at)).toBeNull();
  });

  it("never asks for zero or fewer", () => {
    for (let earned = 0; earned < 1500; earned += 7) {
      const next = toNextTier(earned);
      if (next) expect(next.needed).toBeGreaterThan(0);
    }
  });
});
