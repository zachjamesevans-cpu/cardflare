import { describe, expect, it } from "vitest";

import { chooseSpread, formatReport } from "@/lib/cards/spot-check";

function card(overrides: Partial<Parameters<typeof chooseSpread>[0][0]> = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    canonical_card_number: "OP01-001",
    exact_name: "Test Card",
    card_type: "character",
    colors: ["red"],
    traits: [],
    cost: 2,
    power: 3000,
    counter: null,
    life: null,
    rarity: "C",
    attribute: "Slash",
    effect_text: null,
    trigger_text: null,
    ...overrides,
  };
}

describe("chooseSpread", () => {
  /*
   * A Leader and an Event fail in different ways — one has life and no cost,
   * the other no power. Checking three Characters proves very little.
   */
  it("takes one of every card type", () => {
    const spread = chooseSpread([
      card({ card_type: "character" }),
      card({ card_type: "character" }),
      card({ card_type: "leader" }),
      card({ card_type: "event" }),
      card({ card_type: "stage" }),
    ]);

    expect(new Set(spread.map((entry) => entry.row.card_type))).toEqual(
      new Set(["character", "leader", "event", "stage"]),
    );
  });

  it("reaches for the awkward shapes as well", () => {
    const spread = chooseSpread([
      card({ card_type: "character" }),
      card({ colors: ["blue", "black"] }),
      card({ counter: 1000 }),
      card({ trigger_text: "Draw 1 card." }),
      card({ life: 4 }),
      card({ cost: null }),
      card({ traits: ["Straw Hat Crew"] }),
    ]);

    const reasons = spread.map((entry) => entry.because);

    expect(reasons).toContain("multicolour");
    expect(reasons).toContain("has a counter");
    expect(reasons).toContain("has a trigger");
    expect(reasons).toContain("has life");
    expect(reasons).toContain("no cost");
  });

  /* Whoever is checking needs to know what they are meant to be looking at. */
  it("says why each card was picked", () => {
    const spread = chooseSpread([card({ card_type: "leader" })]);

    expect(spread[0]!.because).toBe("card type: leader");
  });

  it("never picks the same card twice", () => {
    // One card that satisfies several reasons at once.
    const everything = card({
      card_type: "leader",
      colors: ["red", "green"],
      counter: 1000,
      trigger_text: "Draw 1.",
      life: 4,
      cost: null,
    });

    expect(chooseSpread([everything])).toHaveLength(1);
  });

  it("stays a sample rather than a dump of the catalog", () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      card({ card_type: `type-${i}` }),
    );

    expect(chooseSpread(many).length).toBeLessThanOrEqual(12);
  });

  it("has nothing to offer for an empty catalog", () => {
    expect(chooseSpread([])).toEqual([]);
  });
});

describe("formatReport", () => {
  const entry = {
    row: card({
      canonical_card_number: "OP01-024",
      exact_name: "Monkey D. Luffy",
      colors: ["red"],
      traits: ["Straw Hat Crew", "Supernovas"],
      counter: 1000,
      effect_text: "  [On Play]   Draw 1 card.\n\nThen discard 1.  ",
    }),
    because: "has a counter",
  };

  it("leads with the number and the exact name", () => {
    const report = formatReport([entry], new Map(), 4211);

    expect(report).toContain("OP01-024  Monkey D. Luffy");
    expect(report).toContain("4,211 cards");
  });

  it("says why the card is in the list", () => {
    expect(formatReport([entry], new Map(), 1)).toContain("picked: has a counter");
  });

  /* Newlines inside effect text would break the one-field-per-line layout. */
  it("flattens effect text onto a single line", () => {
    const report = formatReport([entry], new Map(), 1);

    expect(report).toContain("[On Play] Draw 1 card. Then discard 1.");
  });

  it("renders an absent value as a dash rather than blank or null", () => {
    const report = formatReport([entry], new Map(), 1);

    expect(report).toMatch(/life\s+—/);
    expect(report).not.toContain("null");
    expect(report).not.toContain("undefined");
  });

  it("says so plainly when there is nothing imported", () => {
    expect(formatReport([], new Map(), 0)).toMatch(/no cards imported/i);
  });
});
