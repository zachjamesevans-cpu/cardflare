import { describe, expect, it } from "vitest";

import {
  addCard,
  changePrinting,
  keyOf,
  lessCard,
  lineKey,
} from "@/components/flares/draft";
import type { CardPrinting, CardResult } from "@/lib/cards/schema";

/**
 * Picking an alt art means picking the alt art.
 *
 * The founder: "when posting a flare in a group and selecting multiple,
 * it adds the number at the root of the card... also, for some reason,
 * this is linked. so when that happens, even though i select the alt
 * art, it does the main version of it base rarity. that should not be
 * the case."
 *
 * The draft is keyed by CARD, which is right - the same card twice is
 * more copies, not a second row. But the old rule set the printing only
 * on a card that had NONE, so tapping the card and then one of its
 * versions kept the first answer and threw the tap away. Tapping a
 * version is the most specific thing anybody can say about which art
 * they want; it is the one answer that must never be discarded.
 */
const printing = (id: string, rarity: string): CardPrinting => ({
  id,
  setCode: "EB-02",
  setName: "Memorial Collection",
  printingLabel: rarity,
  variantType: null,
  rarity,
  printingName: null,
  isPromo: null,
  imageUrl: null,
});

const BASE = printing("base-id", "SR");
const ALT = printing("alt-id", "SR Alternate Art");

const card = {
  id: "card-1",
  exactName: "Jewelry Bonney",
  canonicalCardNumber: "EB02-015",
  printings: [BASE, ALT],
} as unknown as CardResult;

describe("adding a card to a Flare draft", () => {
  it("keeps the printing when the first tap named one", () => {
    const [entry] = addCard([], card, ALT);
    expect(entry.printingId).toBe("alt-id");
    expect(entry.quantity).toBe(1);
  });

  it("takes ANY printing when the tap was the card itself", () => {
    const [entry] = addCard([], card);
    expect(entry.printingId).toBeNull();
  });

  it("gives a version its own line beside the any-printing pick", () => {
    /*
     * THE BUG, the second time round. One line per card meant every art
     * tapped folded into that line and bumped its count: "whichever the
     * final card is that's the quantity of that card. Math is wrong."
     */
    const first = addCard([], card);
    const cards = addCard(first, card, ALT);

    expect(cards).toHaveLength(2);
    expect(cards.map(keyOf)).toEqual([
      lineKey("card-1", null),
      lineKey("card-1", "alt-id"),
    ]);
    expect(cards.map((item) => item.quantity)).toEqual([1, 1]);
  });

  it("keeps two versions of one card as two lines", () => {
    const cards = addCard(addCard([], card, BASE), card, ALT);
    expect(cards.map((item) => item.printingId)).toEqual(["base-id", "alt-id"]);
  });

  it("counts a second tap on the same version as one more copy of that line", () => {
    const cards = addCard(addCard(addCard([], card, ALT), card, ALT), card);
    expect(cards.map((item) => [item.printingId, item.quantity])).toEqual([
      ["alt-id", 2],
      [null, 1],
    ]);
  });
});

describe("one fewer, and changing a line's printing", () => {
  it("takes one copy off the named line and drops it at none", () => {
    const two = addCard(addCard([], card, ALT), card, ALT);
    const one = lessCard(two, lineKey("card-1", "alt-id"));
    expect(one[0]?.quantity).toBe(1);
    expect(lessCard(one, lineKey("card-1", "alt-id"))).toHaveLength(0);
    /* A key that is not there changes nothing. */
    expect(lessCard(one, lineKey("card-1", null))).toEqual(one);
  });

  it("re-keys a line when its printing changes, folding into a twin if one exists", () => {
    const cards = addCard(addCard([], card), card, ALT);
    const moved = changePrinting(cards, lineKey("card-1", null), "base-id");
    expect(moved.map((item) => item.printingId)).toEqual(["base-id", "alt-id"]);

    const folded = changePrinting(moved, lineKey("card-1", "base-id"), "alt-id");
    expect(folded).toHaveLength(1);
    expect(folded[0]?.printingId).toBe("alt-id");
    expect(folded[0]?.quantity).toBe(2);
  });
});

describe("where the picker draws its number", () => {
  it("marks the version that was tapped, not the card above it", async () => {
    /*
     * "if there's 7 diff alt arts for bonney and i click the bottom one,
     * the number appears to the right of the main one... you should't
     * have to scroll up to see that."
     */
    const { readFile } = await import("node:fs/promises");
    const picker = await readFile("src/components/flares/card-picker.tsx", "utf8");
    const search = await readFile("src/components/cards/card-search.tsx", "utf8");

    /* The card row wears it only for the any-printing line. */
    expect(picker).toContain("keyOf(item) === lineKey(card.id, null)");
    /* And a named version wears its own line's count. */
    expect(picker).toContain("markForPrintingFor={");
    expect(picker).toContain("keyOf(item) === lineKey(card.id, printing.id)");
    /* Which the version list can actually draw. */
    expect(search).toContain("markFor?.(printing)");
  });
});
