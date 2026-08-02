import { describe, expect, it } from "vitest";

import { mergeByCardNumber } from "@/lib/cards/sync";
import { OptcgApiProvider } from "@/lib/cards/providers/optcgapi/adapter";
import { printingLabel, type CardPrinting } from "@/lib/cards/schema";

/**
 * A base art and an alternate art of the same card.
 *
 * Both come from `/api/allSetCards/` with the same `card_set_id`, so they are
 * one gameplay identity — and they are two different physical cards, which is
 * the whole substance of a trade. Shaped on the observed set record.
 */
const base = {
  card_set_id: "OP12-034",
  card_name: "Perona",
  set_id: "OP12",
  set_name: "Legacy of the Master",
  rarity: "C",
  card_color: "Purple",
  card_type: "Character",
  card_cost: "2",
  card_power: "3000",
  counter_amount: 1000,
  card_image_id: "OP12-034",
  card_image: "https://optcgapi.com/media/static/Card_Images/OP12-034.jpg",
};

const alternate = {
  ...base,
  rarity: "SR",
  card_image_id: "OP12-034_p1",
  card_image: "https://optcgapi.com/media/static/Card_Images/OP12-034_p1.jpg",
};

const provider = new OptcgApiProvider();
const normalize = (record: unknown) => {
  const result = provider.normalizeCard(record, "set");
  if (!result.ok) throw new Error(`expected to normalise: ${result.failure.reason}`);
  return result.card;
};

describe("an alternate art", () => {
  it("keys separately from the base printing", () => {
    expect(normalize(base).printings[0]!.providerExternalId).not.toBe(
      normalize(alternate).printings[0]!.providerExternalId,
    );
  });

  /*
   * Rarity is on the printing as well as the card. Merging keeps the first
   * card's rarity, so without a per-printing copy the alternate art's is lost
   * the moment the two records collapse into one card.
   */
  it("keeps its own rarity", () => {
    expect(normalize(base).printings[0]!.rarity).toBe("C");
    expect(normalize(alternate).printings[0]!.rarity).toBe("SR");
  });

  it("survives the merge as a second printing of one card", () => {
    const merged = mergeByCardNumber([normalize(base), normalize(alternate)]);

    expect(merged).toHaveLength(1);
    expect(merged[0]!.canonicalCardNumber).toBe("OP12-034");
    expect(merged[0]!.printings).toHaveLength(2);
    expect(merged[0]!.printings.map((p) => p.rarity).sort()).toEqual(["C", "SR"]);
  });

  it("keeps its own artwork", () => {
    const merged = mergeByCardNumber([normalize(base), normalize(alternate)]);
    const urls = merged[0]!.printings.map((p) => p.imageUrl);

    expect(new Set(urls).size).toBe(2);
  });

  /* Re-importing the same two records must not grow the printing list. */
  it("does not duplicate when the sync runs twice", () => {
    const once = mergeByCardNumber([normalize(base), normalize(alternate)]);
    const twice = mergeByCardNumber([
      normalize(base),
      normalize(alternate),
      normalize(base),
      normalize(alternate),
    ]);

    expect(twice[0]!.printings).toHaveLength(once[0]!.printings.length);
  });
});

describe("telling two printings apart in the UI", () => {
  const printing = (over: Partial<CardPrinting> = {}): CardPrinting => ({
    setCode: "OP12",
    setName: "Legacy of the Master",
    printingLabel: "OP12",
    variantType: null,
    rarity: null,
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
