import { describe, expect, it } from "vitest";

import { cardArts } from "@/lib/cards/card-arts";
import type { CardPrinting } from "@/lib/cards/schema";

const printing = (
  id: string,
  variantType: string,
  imageUrl: string | null,
): CardPrinting =>
  ({
    id,
    setCode: "OP12",
    setName: null,
    printingLabel: null,
    variantType,
    rarity: null,
    printingName: "Perona",
    isPromo: null,
    imageUrl,
  }) as CardPrinting;

describe("a card's arts, for the carousel", () => {
  it("one page per image, the plain art first, its variants named together", () => {
    const arts = cardArts(
      [
        printing("a", "altArt", "https://images.scrydex.com/alt.png"),
        printing("b", "foil", "https://images.scrydex.com/base.png"),
        printing("c", "normal", "https://images.scrydex.com/base.png"),
      ],
      "Perona",
    );
    expect(arts.map((art) => art.imageUrl)).toEqual([
      "https://images.scrydex.com/base.png",
      "https://images.scrydex.com/alt.png",
    ]);
    expect(arts[0].variants.sort()).toEqual(["foil", "normal"]);
    expect(arts[1].variants).toEqual(["altArt"]);
  });

  it("a printing with no image is not a page; none at all is an empty list", () => {
    expect(cardArts([printing("a", "normal", null)], "Perona")).toEqual([]);
    expect(cardArts([], "Perona")).toEqual([]);
  });

  it("the card sheet and the card page both draw it", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("mobile/src/screens/card.tsx", "utf8")).toContain(
      "<ArtCarousel",
    );
    expect(readFileSync("src/components/cards/card-page.tsx", "utf8")).toContain(
      "<CardArtCarousel",
    );
  });
});
