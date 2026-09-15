import { describe, expect, it } from "vitest";

import {
  ATTENDANCE_WEEKLY_CAP,
  EMBERS_BOTH_NEW,
  EMBERS_LATE_ACKNOWLEDGE,
  EMBERS_NEW_PARTNER,
  EMBERS_PAST_CEILING,
  EMBER_TIERS,
  NEW_ACCOUNT_DAYS,
  PAIR_LADDER,
  ROOM_FULL_TRADES,
  ROOM_HALF_TRADES,
  WEEKLY_CEILING,
  ageInDays,
  attendancePays,
  emberTier,
  embersForLateTrade,
  embersForTrade,
  purchaseRef,
  toNextTier,
  tradeAwardRef,
  tradeReversalRef,
  type TradeAwardInput,
} from "@/lib/players/ember-rules";

/**
 * The economy's arithmetic, on its own: only a confirmed trade earns,
 * and every curve below is a guard against one way of farming the
 * badge that leaves a real night at a store untouched.
 */

const honest: TradeAwardInput = {
  partnerKnown: true,
  pairTradesThisSeason: 0,
  roomPaidTrades: 0,
  weekEarned: 0,
  accountAgeDays: 100,
  partnerAgeDays: 100,
};

describe("embersForTrade", () => {
  it("pays the most for meeting somebody new", () => {
    expect(embersForTrade(honest)).toBe(EMBERS_NEW_PARTNER);
    expect(EMBERS_NEW_PARTNER).toBe(10);
  });

  it("walks the pair ladder down to nothing inside a season", () => {
    expect(embersForTrade({ ...honest, pairTradesThisSeason: 1 })).toBe(PAIR_LADDER[1]);
    expect(embersForTrade({ ...honest, pairTradesThisSeason: 2 })).toBe(PAIR_LADDER[2]);
    expect(embersForTrade({ ...honest, pairTradesThisSeason: 3 })).toBe(0);
    expect(embersForTrade({ ...honest, pairTradesThisSeason: 40 })).toBe(0);
  });

  it("pays nothing when nobody was named, because nothing corroborates it", () => {
    expect(embersForTrade({ ...honest, partnerKnown: false })).toBe(0);
  });

  it("tapers a busy room: full, then half, then nothing", () => {
    expect(embersForTrade({ ...honest, roomPaidTrades: ROOM_FULL_TRADES - 1 })).toBe(
      10,
    );
    expect(embersForTrade({ ...honest, roomPaidTrades: ROOM_FULL_TRADES })).toBe(5);
    expect(
      embersForTrade({
        ...honest,
        roomPaidTrades: ROOM_FULL_TRADES + ROOM_HALF_TRADES,
      }),
    ).toBe(0);
  });

  it("halves a young account and floors two young accounts at one", () => {
    expect(embersForTrade({ ...honest, accountAgeDays: NEW_ACCOUNT_DAYS - 1 })).toBe(5);
    expect(
      embersForTrade({
        ...honest,
        accountAgeDays: 2,
        partnerAgeDays: 2,
      }),
    ).toBe(EMBERS_BOTH_NEW);
    /* The partner's youth alone does not cost YOU anything. */
    expect(embersForTrade({ ...honest, partnerAgeDays: 1 })).toBe(10);
  });

  it("caps the week, then pays a token", () => {
    expect(embersForTrade({ ...honest, weekEarned: WEEKLY_CEILING - 1 })).toBe(10);
    expect(embersForTrade({ ...honest, weekEarned: WEEKLY_CEILING })).toBe(
      EMBERS_PAST_CEILING,
    );
  });

  it("never rounds a positive base below one, and never goes negative", () => {
    expect(
      embersForTrade({
        ...honest,
        pairTradesThisSeason: 2,
        roomPaidTrades: ROOM_FULL_TRADES,
        accountAgeDays: 1,
      }),
    ).toBe(1);
    for (let pair = 0; pair < 5; pair++) {
      for (let room = 0; room < 12; room++) {
        expect(
          embersForTrade({
            ...honest,
            pairTradesThisSeason: pair,
            roomPaidTrades: room,
          }),
        ).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("stacks the curves: the honest heavy night still pays something", () => {
    /* Six friends, one evening, everybody trading with everybody: the
       thirtieth first-trade of the night for one person pays zero. */
    expect(embersForTrade({ ...honest, roomPaidTrades: 10 })).toBe(0);
  });
});

describe("the late trade", () => {
  it("pays the author the unconfirmed rate, and the ceiling still applies", () => {
    expect(embersForLateTrade(0)).toBe(EMBERS_LATE_ACKNOWLEDGE);
    expect(embersForLateTrade(WEEKLY_CEILING)).toBe(EMBERS_PAST_CEILING);
    expect(EMBERS_LATE_ACKNOWLEDGE).toBeLessThan(EMBERS_NEW_PARTNER);
  });
});

describe("attendance", () => {
  it("pays up to the weekly cap and then stops", () => {
    expect(attendancePays(0)).toBe(true);
    expect(attendancePays(ATTENDANCE_WEEKLY_CAP - 1)).toBe(true);
    expect(attendancePays(ATTENDANCE_WEEKLY_CAP)).toBe(false);
  });

  it("measures an account's age in whole days, never negative", () => {
    const now = Date.parse("2026-09-15T12:00:00Z");
    expect(ageInDays("2026-09-01T12:00:00Z", now)).toBe(14);
    expect(ageInDays("2026-09-15T00:00:00Z", now)).toBe(0);
    expect(ageInDays("2026-09-16T00:00:00Z", now)).toBe(0);
    expect(ageInDays("not a date", now)).toBe(0);
  });
});

describe("idempotency keys", () => {
  it("carry the player as well as the trade, because both sides are paid", () => {
    expect(tradeAwardRef("t", "a")).not.toBe(tradeAwardRef("t", "b"));
  });

  it("keep a reversal distinct from the award it undoes", () => {
    expect(tradeReversalRef("t", "a")).not.toBe(tradeAwardRef("t", "a"));
    expect(tradeReversalRef("t", "a")).toContain(tradeAwardRef("t", "a"));
  });

  it("key a purchase to the player and the item", () => {
    expect(purchaseRef("p", "frost")).toBe("purchase:p:frost");
  });
});

describe("the tiers", () => {
  it("start at zero and climb", () => {
    expect(EMBER_TIERS[0].at).toBe(0);
    for (let i = 1; i < EMBER_TIERS.length; i++) {
      expect(EMBER_TIERS[i].at).toBeGreaterThan(EMBER_TIERS[i - 1].at);
    }
  });

  it("name a total and say how far to the next", () => {
    expect(emberTier(0)).toBe("Spark");
    expect(emberTier(50)).toBe("Kindling");
    expect(emberTier(9999)).toBe("Inferno");
    expect(toNextTier(0)).toEqual({ name: "Kindling", needed: 50 });
    expect(toNextTier(9999)).toBeNull();
  });
});
