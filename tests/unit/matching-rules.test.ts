import { describe, expect, it } from "vitest";

import {
  heldByCard,
  heldCountByCard,
  inRailOrder,
  matchFor,
  youHaveLabel,
  offerMessageSchema,
  offerQuantitySchema,
  offersByFlare,
  pledgeTally,
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
    quantity: 1,
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

describe("offerQuantitySchema", () => {
  it("coerces form strings and clamps to the 1..99 window", () => {
    expect(offerQuantitySchema.parse("2")).toBe(2);
    expect(offerQuantitySchema.parse(99)).toBe(99);
  });

  it("turns anything unparseable into one copy, never a refusal", () => {
    expect(offerQuantitySchema.parse("lots")).toBe(1);
    expect(offerQuantitySchema.parse(0)).toBe(1);
    expect(offerQuantitySchema.parse(100)).toBe(1);
    expect(offerQuantitySchema.parse(undefined)).toBe(1);
  });
});

describe("pledgeTally", () => {
  const pledge = (quantity: number): Offer => ({
    flareId: "f1",
    responderSessionId: "r1",
    displayName: "Chunc",
    message: null,
    quantity,
    present: true,
  });

  it("reads the founder's example: 2x asked, 1 pledged, 1 still needed", () => {
    expect(pledgeTally([pledge(1)], 2)).toEqual({ pledged: 1, remaining: 1 });
  });

  it("caps the pledged count at the ask for display", () => {
    expect(pledgeTally([pledge(3), pledge(4)], 2)).toEqual({
      pledged: 2,
      remaining: 0,
    });
  });

  it("sums pledges across responders", () => {
    expect(pledgeTally([pledge(1), pledge(1)], 3)).toEqual({
      pledged: 2,
      remaining: 1,
    });
  });

  it("is quiet arithmetic on an unanswered Flare", () => {
    expect(pledgeTally([], 2)).toEqual({ pledged: 0, remaining: 2 });
  });
});

/*
 * The card viewer's line, which is the only place these three phrases
 * appear and the only thing the founder asked for on a tap. Tested as
 * words rather than as rendering, because the app carries a copy of this
 * function (mobile/src/held-label.ts) and the two must not drift.
 */
describe("youHaveLabel", () => {
  it("says you have it when the binder proves the printing", () => {
    expect(youHaveLabel("exact", 1)).toBe("You have this");
  });

  /* "You have 1 in your binder" is a worse way of saying "You have this". */
  it("does not count a single copy", () => {
    expect(youHaveLabel("exact", 0)).toBe("You have this");
    expect(youHaveLabel("exact", 1)).toBe("You have this");
  });

  it("counts once there is more than one", () => {
    expect(youHaveLabel("exact", 2)).toBe("You have 2 in your binder");
    expect(youHaveLabel("exact", 11)).toBe("You have 11 in your binder");
  });

  /*
   * Never a number on a printing you cannot prove. The interesting fact
   * is the mismatch, and a count beside it reads as a promise about the
   * version the other player did not ask for.
   */
  it("never counts a printing it cannot prove", () => {
    expect(youHaveLabel("other-printing", 1)).toBe("You have another printing");
    expect(youHaveLabel("other-printing", 7)).toBe("You have another printing");
  });
});

describe("heldCountByCard", () => {
  it("adds up every binder row for one card", () => {
    const counts = heldCountByCard([
      { cardId: "a", quantity: 2 },
      { cardId: "a", quantity: 3 },
      { cardId: "b", quantity: 1 },
    ]);

    expect(counts.get("a")).toBe(5);
    expect(counts.get("b")).toBe(1);
  });

  it("has nothing to say about a card the binder does not name", () => {
    expect(heldCountByCard([]).get("a")).toBeUndefined();
  });
});

/*
 * The rail's order, which is two rules that can disagree. The app holds a
 * copy of this function (mobile/src/rail-order.ts), so the tie-break is
 * pinned here rather than living in a comment on each side.
 */
describe("inRailOrder", () => {
  const rail = (...items: { id: string; held?: boolean; covered?: boolean }[]) =>
    inRailOrder(
      items,
      (item) => Boolean(item.held),
      (item) => Boolean(item.covered),
    ).map((item) => item.id);

  it("puts cards you can answer at the front", () => {
    expect(rail({ id: "a" }, { id: "b", held: true }, { id: "c" })).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("parks settled hunts at the end", () => {
    expect(rail({ id: "a", covered: true }, { id: "b" })).toEqual(["b", "a"]);
  });

  /* The disagreement: settled outranks interesting. A card you hold that
     somebody has already promised is not something you need to see first. */
  it("sends a card you hold to the end once it is spoken for", () => {
    expect(
      rail(
        { id: "a" },
        { id: "b", held: true, covered: true },
        { id: "c", held: true },
      ),
    ).toEqual(["c", "a", "b"]);
  });

  it("keeps the original order inside each band", () => {
    expect(
      rail({ id: "a", held: true }, { id: "b" }, { id: "c", held: true }, { id: "d" }),
    ).toEqual(["a", "c", "b", "d"]);
  });
});
