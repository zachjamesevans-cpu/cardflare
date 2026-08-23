import { describe, expect, it } from "vitest";

import type { DisplayFlare } from "@/lib/event-hub/display-payload";
import {
  flareGroupHeading,
  flareGroupKey,
  groupFlares,
  orderByAsker,
} from "@/lib/event-hub/flare-groups";

/**
 * Whose card is whose, on the wall.
 *
 * The founder, from a live shop: "if people have multiple flares posted
 * on that bottom bar, there should be a divider between two different
 * people's flares." A group is a person, and the divider is the edge of
 * a group — so the grouping has to be right or the divider is drawn in
 * the wrong places.
 */

const flare = (over: Partial<DisplayFlare> & { cardId: string }): DisplayFlare => ({
  cardName: "Card",
  cardNumber: "OP17-000",
  imageUrl: null,
  quantity: 1,
  people: 1,
  askedBy: null,
  storeMayHave: false,
  ...over,
});

describe("which group a card belongs to", () => {
  it("puts one person's cards under that person", () => {
    expect(flareGroupKey(flare({ cardId: "a", askedBy: "CHUNC" }))).toBe(
      flareGroupKey(flare({ cardId: "b", askedBy: "CHUNC" })),
    );
  });

  it("leaves a card several people want standing alone", () => {
    /* "3 people are looking for this" is a fact about the CARD. Folding
       two such cards together would claim the same three people wanted
       both of them, which nothing in the payload says. */
    const first = flare({ cardId: "a", people: 3, askedBy: null });
    const second = flare({ cardId: "b", people: 3, askedBy: null });

    expect(flareGroupKey(first)).not.toBe(flareGroupKey(second));
  });

  it("does not merge two guests who never gave a name", () => {
    const first = flare({ cardId: "a", askedBy: null });
    const second = flare({ cardId: "b", askedBy: null });

    expect(flareGroupKey(first)).not.toBe(flareGroupKey(second));
  });

  it("writes a heading that agrees with itself", () => {
    expect(flareGroupHeading(flare({ cardId: "a", askedBy: "Savannah" }))).toEqual({
      who: "Savannah",
      verb: "is looking for",
    });
    expect(flareGroupHeading(flare({ cardId: "a", people: 3 }))).toEqual({
      who: "3 people",
      verb: "are looking for",
    });
  });
});

describe("gathering the visible cards", () => {
  it("joins one person's cards into a single group", () => {
    /*
     * THE BUG THIS EXISTS FOR. The first cut compared each card's key
     * against the last group's `key` — which carries an index appended
     * for React — so it never matched, every card became its own group,
     * and the board rendered "CHUNC is looking for" twice in a row above
     * one card each. It typechecked. It was found by looking at it.
     */
    const groups = groupFlares([
      flare({ cardId: "a", askedBy: "CHUNC" }),
      flare({ cardId: "b", askedBy: "CHUNC" }),
      flare({ cardId: "c", askedBy: "Savannah" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].who).toBe("CHUNC");
    expect(groups[0].flares.map((f) => f.cardId)).toEqual(["a", "b"]);
    expect(groups[1].who).toBe("Savannah");
  });

  it("gives every group a key of its own", () => {
    /* A person whose cards were split by somebody else's gets two
       headings, and React needs to tell them apart. */
    const groups = groupFlares([
      flare({ cardId: "a", askedBy: "CHUNC" }),
      flare({ cardId: "b", askedBy: "Savannah" }),
      flare({ cardId: "c", askedBy: "CHUNC" }),
    ]);

    expect(groups).toHaveLength(3);
    expect(new Set(groups.map((g) => g.key)).size).toBe(3);
  });

  it("keeps every card, in the order it was given", () => {
    const flares = ["a", "b", "c", "d"].map((cardId) =>
      flare({ cardId, askedBy: cardId === "c" ? "Kaito" : "CHUNC" }),
    );

    expect(groupFlares(flares).flatMap((g) => g.flares.map((f) => f.cardId))).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("has nothing to group when nothing is posted", () => {
    expect(groupFlares([])).toEqual([]);
  });
});

describe("ordering before the rotation cuts", () => {
  it("brings one person's cards together", () => {
    /*
     * Load-bearing, and the reason this is a separate step: the display
     * shows a window of a few cards at a time. Two of somebody's cards
     * at opposite ends of the board land in different windows, and the
     * grouping never gets the chance to happen.
     */
    const ordered = orderByAsker([
      flare({ cardId: "a", askedBy: "CHUNC" }),
      flare({ cardId: "b", askedBy: "Savannah" }),
      flare({ cardId: "c", askedBy: "CHUNC" }),
    ]);

    expect(ordered.map((f) => f.cardId)).toEqual(["a", "c", "b"]);
  });

  it("keeps people in the order they first appear", () => {
    /* A board that reshuffles between polls is a board somebody is
       halfway through reading. */
    const ordered = orderByAsker([
      flare({ cardId: "a", askedBy: "Zoe" }),
      flare({ cardId: "b", askedBy: "Adam" }),
      flare({ cardId: "c", askedBy: "Zoe" }),
    ]);

    expect(ordered.map((f) => f.askedBy)).toEqual(["Zoe", "Zoe", "Adam"]);
  });

  it("does not lose or invent a card", () => {
    const flares = ["a", "b", "c", "d", "e"].map((cardId) =>
      flare({ cardId, askedBy: cardId < "c" ? "CHUNC" : null, people: 1 }),
    );

    expect(orderByAsker(flares)).toHaveLength(5);
    expect(new Set(orderByAsker(flares).map((f) => f.cardId)).size).toBe(5);
  });
});
