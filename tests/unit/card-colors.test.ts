import { describe, expect, it } from "vitest";

import { OptcgApiProvider } from "@/lib/cards/providers/optcgapi/adapter";

import rainbowLeader from "../fixtures/optcgapi/rainbowLeader.json";

/**
 * A real rejected record from the 2 August 2026 full sync.
 *
 * `card_color` is `"Blue Green Purple Red Black Yellow"` — one space-separated
 * string, 34 characters. A colour is capped at 24, so the record was skipped;
 * and had it fitted it would have been stored as a single colour that no
 * colour filter could ever match.
 */
const provider = new OptcgApiProvider();

describe("a multicolour Leader", () => {
  it("is imported rather than rejected", () => {
    const result = provider.normalizeCard(rainbowLeader, "promo");

    expect(result.ok).toBe(true);
  });

  it("keeps every colour separately, so colour filtering can match it", () => {
    const result = provider.normalizeCard(rainbowLeader, "promo");
    if (!result.ok) throw new Error("expected the record to normalise");

    expect(result.card.colors).toEqual([
      "blue",
      "green",
      "purple",
      "red",
      "black",
      "yellow",
    ]);
  });

  it("reads the rest of the record correctly", () => {
    const result = provider.normalizeCard(rainbowLeader, "promo");
    if (!result.ok) throw new Error("expected the record to normalise");

    expect(result.card.canonicalCardNumber).toBe("P-700");
    expect(result.card.cardType).toBe("leader");
    expect(result.card.life).toBe(5);
    expect(result.card.power).toBe(5000);
    // A Leader has no cost, and null is the honest value for that.
    expect(result.card.cost).toBeNull();
  });
});

describe("colour splitting", () => {
  const colorsOf = (card_color: unknown) => {
    const result = provider.normalizeCard(
      { card_set_id: "OP01-001", card_name: "Test", card_color },
      "set",
    );
    if (!result.ok) throw new Error("expected the record to normalise");
    return result.card.colors;
  };

  it("leaves a single colour alone", () => {
    expect(colorsOf("Blue")).toEqual(["blue"]);
  });

  it("handles the punctuation the provider might use instead", () => {
    expect(colorsOf("Red/Green")).toEqual(["red", "green"]);
    expect(colorsOf("Red, Green")).toEqual(["red", "green"]);
  });

  it("is not confused by extra whitespace", () => {
    expect(colorsOf("  Red   Green  ")).toEqual(["red", "green"]);
  });

  it("has nothing to say when the provider said nothing", () => {
    expect(colorsOf(null)).toEqual([]);
    expect(colorsOf("")).toEqual([]);
  });

  /*
   * The fix was to split the value, not to raise the limit. A single token
   * that long is not a colour, and must still be rejected — otherwise the next
   * unexpected shape gets waved through instead of recorded.
   */
  it("still rejects one token too long to be a colour", () => {
    const result = provider.normalizeCard(
      {
        card_set_id: "OP01-001",
        card_name: "Test",
        card_color: "Blue-Green-Purple-Red-Black-Yellow",
      },
      "set",
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toMatch(/colors/);
  });
});

/*
 * The reason colours get their own splitter. Trait names contain spaces, so
 * the same rule applied to sub_types would turn two traits into six fragments.
 * This asserts the bug is not introduced, not that trait separation is solved
 * — it is not, and that stays a documented limitation.
 */
describe("traits", () => {
  it("are not split on whitespace", () => {
    const result = provider.normalizeCard(
      {
        card_set_id: "OP01-001",
        card_name: "Test",
        sub_types: "Straw Hat Crew",
      },
      "set",
    );
    if (!result.ok) throw new Error("expected the record to normalise");

    expect(result.card.traits).toEqual(["Straw Hat Crew"]);
  });
});
