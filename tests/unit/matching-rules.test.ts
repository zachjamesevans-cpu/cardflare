import { describe, expect, it } from "vitest";

import {
  heldByCard,
  matchFor,
  offerMessageSchema,
  offersByFlare,
  MAX_OFFER_MESSAGE,
  type Offer,
} from "@/lib/matching/schema";

/**
 * The matching rules, and the promise Milestone 6 left for this one:
 * "a player who wants the alternate art specifically can say so, and
 * Milestone 7 can honour the difference instead of guessing."
 *
 * The dangerous failure is the false positive. Telling a player "you have
 * this" when the requester wants the alt art and the binder holds the base
 * sends someone on a walk that ends in "no, not that one" — and one bad
 * match costs more trust than ten missed ones.
 */

const CARD = "card-1";
const ALT_ART = "printing-alt";
const BASE = "printing-base";

function held(...entries: [string, string | null][]) {
  return heldByCard(entries.map(([cardId, printingId]) => ({ cardId, printingId })));
}

describe("matchFor", () => {
  it("matches an any-printing Flare against any copy of the card", () => {
    expect(matchFor({ cardId: CARD, printingId: null }, held([CARD, BASE]))).toBe(
      "exact",
    );
    expect(matchFor({ cardId: CARD, printingId: null }, held([CARD, null]))).toBe(
      "exact",
    );
  });

  it("matches a specific Flare exactly only on that printing", () => {
    expect(matchFor({ cardId: CARD, printingId: ALT_ART }, held([CARD, ALT_ART]))).toBe(
      "exact",
    );
  });

  it("downgrades the wrong printing rather than rounding it up", () => {
    expect(matchFor({ cardId: CARD, printingId: ALT_ART }, held([CARD, BASE]))).toBe(
      "other-printing",
    );
  });

  /*
   * A binder entry that names no printing is not proof of the right one.
   * Claiming "exact" here is precisely the guess this milestone removes.
   */
  it("treats an unspecified binder printing as unproven, not as a wildcard", () => {
    expect(matchFor({ cardId: CARD, printingId: ALT_ART }, held([CARD, null]))).toBe(
      "other-printing",
    );
  });

  it("finds the exact printing among several held ones", () => {
    expect(
      matchFor(
        { cardId: CARD, printingId: ALT_ART },
        held([CARD, BASE], [CARD, ALT_ART]),
      ),
    ).toBe("exact");
  });

  it("never matches a card that is not in the binder at all", () => {
    expect(matchFor({ cardId: CARD, printingId: null }, held(["other", BASE]))).toBe(
      null,
    );
    expect(matchFor({ cardId: CARD, printingId: ALT_ART }, held())).toBe(null);
  });
});

describe("offersByFlare", () => {
  const offer = (flareId: string, responder: string): Offer => ({
    flareId,
    responderSessionId: responder,
    displayName: responder,
    message: null,
    present: true,
  });

  it("groups offers under their Flare, keeping arrival order", () => {
    const grouped = offersByFlare([
      offer("f1", "a"),
      offer("f2", "b"),
      offer("f1", "c"),
    ]);

    expect(grouped.get("f1")?.map((o) => o.responderSessionId)).toEqual(["a", "c"]);
    expect(grouped.get("f2")).toHaveLength(1);
    expect(grouped.get("f3")).toBeUndefined();
  });
});

describe("offerMessageSchema", () => {
  it("collapses whitespace and trims", () => {
    expect(offerMessageSchema.parse("  table   12  ")).toBe("table 12");
  });

  it("turns an empty message into null rather than an empty string", () => {
    expect(offerMessageSchema.parse("")).toBeNull();
    expect(offerMessageSchema.parse("   ")).toBeNull();
  });

  it(`rejects more than ${MAX_OFFER_MESSAGE} characters`, () => {
    expect(offerMessageSchema.safeParse("x".repeat(MAX_OFFER_MESSAGE)).success).toBe(
      true,
    );
    expect(
      offerMessageSchema.safeParse("x".repeat(MAX_OFFER_MESSAGE + 1)).success,
    ).toBe(false);
  });

  /*
   * The message renders beside a name on somebody else's screen, so the same
   * character hygiene as display names applies: nothing that exists to make
   * text read as something it is not.
   */
  it("rejects direction-changing and zero-width characters", () => {
    for (const bad of ["table\u202E21", "here\u200Bthere", "beep\u0007boop"]) {
      expect(offerMessageSchema.safeParse(bad).success).toBe(false);
    }
  });
});
