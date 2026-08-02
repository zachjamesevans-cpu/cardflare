import { describe, expect, it } from "vitest";

import { mergeByCardNumber } from "@/lib/cards/sync";
import { OptcgApiProvider } from "@/lib/cards/providers/optcgapi/adapter";
import {
  printingLabel,
  printingVariantMark,
  type CardPrinting,
} from "@/lib/cards/schema";

/**
 * Everything here comes from one real finding.
 *
 * The admin spot check reported EB01-001 with three printings rendering as
 * "EB-01 · L / EB-01 · L / EB-02 · L" — two chips a player cannot tell apart —
 * and the card itself displaying as "Kouzuki Oden (SPR)", a variant's name
 * standing in for the card's. Rarity separates a base art from an alternate
 * art only when they have different rarities, and these do not.
 */

const provider = new OptcgApiProvider();

const oden = (over: Record<string, unknown> = {}) => ({
  card_set_id: "EB01-001",
  card_name: "Kouzuki Oden",
  set_id: "EB-01",
  set_name: "Memorial Collection",
  rarity: "L",
  card_type: "Leader",
  card_color: "Green Red",
  life: "4",
  card_power: "5000",
  card_image_id: "EB01-001",
  card_image: "https://optcgapi.com/media/static/Card_Images/EB01-001.jpg",
  ...over,
});

const spr = oden({
  card_name: "Kouzuki Oden (SPR)",
  card_image_id: "EB01-001_p1",
  card_image: "https://optcgapi.com/media/static/Card_Images/EB01-001_p1.jpg",
});

function normalize(record: unknown) {
  const result = provider.normalizeCard(record, "set");
  if (!result.ok) throw new Error(`expected to normalise: ${result.failure.reason}`);
  return result.card;
}

describe("a card whose printings are named differently", () => {
  /*
   * The visible half of the bug. Whichever record merged first named the card,
   * and that is not a basis for anything.
   */
  it("takes the base name, whichever printing arrived first", () => {
    expect(mergeByCardNumber([normalize(spr), normalize(oden())])[0]!.exactName).toBe(
      "Kouzuki Oden",
    );
    expect(mergeByCardNumber([normalize(oden()), normalize(spr)])[0]!.exactName).toBe(
      "Kouzuki Oden",
    );
  });

  it("keeps each printing's own name verbatim", () => {
    const merged = mergeByCardNumber([normalize(oden()), normalize(spr)]);

    expect(merged[0]!.printings.map((p) => p.name).sort()).toEqual([
      "Kouzuki Oden",
      "Kouzuki Oden (SPR)",
    ]);
  });

  it("still merges them into one card", () => {
    const merged = mergeByCardNumber([normalize(oden()), normalize(spr)]);

    expect(merged).toHaveLength(1);
    expect(merged[0]!.printings).toHaveLength(2);
  });
});

describe("printingVariantMark", () => {
  const printing = (printingName: string | null): CardPrinting => ({
    id: "11111111-1111-1111-1111-111111111111",
    setCode: "EB-01",
    setName: "Memorial Collection",
    printingLabel: "EB-01",
    variantType: null,
    rarity: "L",
    printingName,
    isPromo: null,
    imageUrl: null,
  });

  it("says nothing for the printing that matches the card", () => {
    expect(printingVariantMark(printing("Kouzuki Oden"), "Kouzuki Oden")).toBeNull();
  });

  it("reduces a marked variant to its mark", () => {
    expect(printingVariantMark(printing("Kouzuki Oden (SPR)"), "Kouzuki Oden")).toBe(
      "SPR",
    );
  });

  /* The promo suffix is a sentence, and reads better without its brackets. */
  it("unwraps a long parenthetical rather than dropping it", () => {
    expect(
      printingVariantMark(
        printing("Gum-Gum Lightning (Premium Card Collection -Best Selection Vol. 4-)"),
        "Gum-Gum Lightning",
      ),
    ).toBe("Premium Card Collection -Best Selection Vol. 4-");
  });

  /* A truncated name would be worse than a long one. */
  it("falls back to the whole name when it is not a clean suffix", () => {
    expect(printingVariantMark(printing("Oden, Kouzuki"), "Kouzuki Oden")).toBe(
      "Oden, Kouzuki",
    );
  });

  it("says nothing when the provider supplied no name", () => {
    expect(printingVariantMark(printing(null), "Kouzuki Oden")).toBeNull();
    expect(printingVariantMark(printing("   "), "Kouzuki Oden")).toBeNull();
  });
});

describe("the chips a player actually reads", () => {
  const base: CardPrinting = {
    id: "11111111-1111-1111-1111-111111111111",
    setCode: "EB-01",
    setName: "Memorial Collection",
    printingLabel: "EB-01",
    variantType: null,
    rarity: "L",
    printingName: "Kouzuki Oden",
    isPromo: null,
    imageUrl: null,
  };

  /* The whole point: these two were identical before. */
  it("are no longer identical for two printings of the same set and rarity", () => {
    const a = printingLabel(base, "Kouzuki Oden");
    const b = printingLabel(
      { ...base, printingName: "Kouzuki Oden (SPR)" },
      "Kouzuki Oden",
    );

    expect(a).toBe("EB-01 · L");
    expect(b).toBe("EB-01 · L · SPR");
    expect(a).not.toBe(b);
  });

  it("works without a card name, for callers that have none", () => {
    expect(printingLabel(base)).toBe("EB-01 · L");
  });
});
