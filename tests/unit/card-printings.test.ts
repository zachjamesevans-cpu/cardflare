import { describe, expect, it } from "vitest";

import { normalizedCardSchema, type NormalizedCard } from "@/lib/cards/domain";
import { mergeByCardNumber } from "@/lib/cards/sync";
import { printingLabel, type CardPrinting } from "@/lib/cards/schema";

/**
 * A base art and an alternate art of the same card.
 *
 * They share a card number, so they are one gameplay identity — and they are
 * two different physical cards, which is the whole substance of a trade.
 */
const perona = (printing: Record<string, unknown>): NormalizedCard =>
  normalizedCardSchema.parse({
    canonicalCardNumber: "OP12-034",
    exactName: "Perona",
    cardType: "Character",
    colors: ["purple"],
    cost: 2,
    power: 3000,
    counter: 1000,
    rarity: "C",
    printings: [{ setCode: "OP12", setName: "Legacy of the Master", ...printing }],
  });

const base = {
  providerExternalId: "OP12-034:normal",
  rarity: "C",
  imageUrl: "https://images.scrydex.com/onepiece/OP12-034/large",
};

const alternate = {
  providerExternalId: "OP12-034:altArt",
  rarity: "SR",
  imageUrl: "https://images.scrydex.com/onepiece/OP12-034A/large",
};

describe("an alternate art", () => {
  it("survives the merge as a second printing of one card", () => {
    const merged = mergeByCardNumber([perona(base), perona(alternate)]);

    expect(merged).toHaveLength(1);
    expect(merged[0]!.canonicalCardNumber).toBe("OP12-034");
    expect(merged[0]!.printings).toHaveLength(2);
    expect(merged[0]!.printings.map((p) => p.rarity).sort()).toEqual(["C", "SR"]);
  });

  it("keeps its own artwork", () => {
    const merged = mergeByCardNumber([perona(base), perona(alternate)]);
    const urls = merged[0]!.printings.map((p) => p.imageUrl);

    expect(new Set(urls).size).toBe(2);
  });

  /* Re-importing the same two records must not grow the printing list. */
  it("does not duplicate when the sync runs twice", () => {
    const once = mergeByCardNumber([perona(base), perona(alternate)]);
    const twice = mergeByCardNumber([
      perona(base),
      perona(alternate),
      perona(base),
      perona(alternate),
    ]);

    expect(twice[0]!.printings).toHaveLength(once[0]!.printings.length);
  });
});

describe("telling two printings apart in the UI", () => {
  const printing = (over: Partial<CardPrinting> = {}): CardPrinting => ({
    id: "11111111-1111-1111-1111-111111111111",
    setCode: "OP12",
    setName: "Legacy of the Master",
    printingLabel: "OP12",
    variantType: null,
    rarity: null,
    printingName: null,
    isPromo: null,
    imageUrl: null,
    ...over,
  });

  /*
   * The reason rarity is in the label at all: both printings carry the same
   * card number and the same set code, so without it they render identically
   * and the strip shows the same chip twice.
   */
  it("distinguishes a base art from an alternate art", () => {
    expect(printingLabel(printing({ rarity: "C" }))).toBe("OP12 · C");
    expect(printingLabel(printing({ rarity: "SR" }))).toBe("OP12 · SR");
  });

  it("still says nothing when the provider gave nothing", () => {
    expect(printingLabel(printing({ setCode: null, printingLabel: null }))).toBeNull();
  });

  it("stacks with the promo marker rather than replacing it", () => {
    expect(printingLabel(printing({ rarity: "SR", isPromo: true }))).toBe(
      "OP12 · SR · Promo",
    );
  });
});
