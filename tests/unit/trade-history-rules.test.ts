import { describe, expect, it } from "vitest";

import { tradeAwardRef, tradeReversalRef } from "@/lib/players/ember-rules";
import { cardCameToYou, tradeIdFromRef } from "@/lib/trades/history-rules";

/**
 * The trade history says "Got" or "Gave" and sums what each trade paid.
 * A wrong direction is exactly the binder surprise the page exists to
 * end, so the two rules are pinned here.
 */
describe("which way a traded card went", () => {
  it("the requester of a want got the card, the holder gave it", () => {
    expect(cardCameToYou(true, false)).toBe(true);
    expect(cardCameToYou(false, false)).toBe(false);
  });

  it("a showcase reverses the seats: its poster gave the card away", () => {
    expect(cardCameToYou(true, true)).toBe(false);
    expect(cardCameToYou(false, true)).toBe(true);
  });
});

describe("the trade behind a ledger ref", () => {
  it("reads the award and the reversal back to the same trade", () => {
    expect(tradeIdFromRef(tradeAwardRef("t-1", "p-1"))).toBe("t-1");
    expect(tradeIdFromRef(tradeReversalRef("t-1", "p-1"))).toBe("t-1");
  });

  it("ignores refs about anything else", () => {
    expect(tradeIdFromRef("purchase:p-1:prism")).toBeNull();
    expect(tradeIdFromRef("attendance:e-1:p-1")).toBeNull();
    expect(tradeIdFromRef("trade:")).toBeNull();
  });
});
