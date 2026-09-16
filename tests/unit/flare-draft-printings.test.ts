import { describe, expect, it } from "vitest";

import { addCard } from "@/components/flares/draft";
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

  it("lets a later version tap override an earlier any-printing pick", () => {
    /* THE BUG. Tap the card, then tap its alternate art: the alt art was
       thrown away and the Flare went out asking for the base. */
    const first = addCard([], card);
    const [entry] = addCard(first, card, ALT);

    expect(entry.printingId, "the tapped alt art must win").toBe("alt-id");
    expect(entry.quantity, "and it is still one more copy").toBe(2);
  });

  it("lets a version tap replace a different version", () => {
    const first = addCard([], card, BASE);
    const [entry] = addCard(first, card, ALT);
    expect(entry.printingId).toBe("alt-id");
  });

  it("leaves a chosen printing alone when the next tap names none", () => {
    /* Tapping the card row after choosing a version is "one more copy",
       not "forget which art I asked for". */
    const first = addCard([], card, ALT);
    const [entry] = addCard(first, card);
    expect(entry.printingId).toBe("alt-id");
    expect(entry.quantity).toBe(2);
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

    /* The card row wears it only for an any-printing pick. */
    expect(picker).toContain("if (item.printingId) return null;");
    /* And a named version wears it itself. */
    expect(picker).toContain("markForPrintingFor={");
    expect(picker).toContain("printing.id === item.printingId");
    /* Which the version list can actually draw. */
    expect(search).toContain("markFor?.(printing)");
  });
});
