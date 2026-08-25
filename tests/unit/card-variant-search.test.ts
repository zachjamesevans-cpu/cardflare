import { describe, expect, it } from "vitest";

import { parseCardQuery } from "@/lib/cards/query";
import {
  floatAskedVariants,
  pickBasePrinting,
  printingLabel,
  printingMatchesAsk,
  printingVariantMark,
  type CardPrinting,
  type CardResult,
} from "@/lib/cards/schema";

/**
 * The founder, with a screenshot of EB04-007: the preview showed the SP
 * art instead of the base, "eb04 zoro" found nothing, and one version
 * chip read "OP15-EB04 · SR · EB04-007) (Alternate Art". And the ask:
 * "if they type in 'zoro manga' it should show the manga variation in
 * the preview image". This file pins all of that except the SQL — the
 * set-code filter fix lives in a migration.
 */

const printing = (over: Partial<CardPrinting> = {}): CardPrinting => ({
  id: crypto.randomUUID(),
  setCode: "EB-04",
  setName: "Anime 25th Collection",
  printingLabel: "EB-04",
  variantType: null,
  rarity: "SR",
  printingName: "Roronoa Zoro",
  isPromo: null,
  imageUrl: "https://optcgapi.com/media/static/Card_Images/EB04-007.jpg",
  ...over,
});

describe("what somebody types about versions", () => {
  it("reads a variant word without losing the name", () => {
    const parsed = parseCardQuery("zoro manga");
    expect(parsed.text).toBe("zoro");
    expect(parsed.filters.variant).toBe("manga");
    expect(parsed.narrowed).toBe(true);
  });

  it("understands the ways people say alt art", () => {
    expect(parseCardQuery("zoro alt").filters.variant).toBe("alt");
    expect(parseCardQuery("zoro alternate").filters.variant).toBe("alt");
    expect(parseCardQuery("zoro parallel").filters.variant).toBe("alt");
    /* "art" after the word is the same phrase, not a search term. */
    const phrase = parseCardQuery("zoro alt art");
    expect(phrase.filters.variant).toBe("alt");
    expect(phrase.text).toBe("zoro");
  });

  it("reads sp and promo the same way", () => {
    expect(parseCardQuery("zoro sp").filters.variant).toBe("sp");
    expect(parseCardQuery("luffy promo").filters.variant).toBe("promo");
  });

  it("never turns a lone variant word into an empty search", () => {
    const parsed = parseCardQuery("manga");
    expect(parsed.text).toBe("manga");
    expect(parsed.filters.variant).toBeNull();
  });
});

describe("the provider's bracketed printing names", () => {
  it("drops a bracket group that is just the card number", () => {
    /* The provider writes "Roronoa Zoro (EB04-007)" for the BASE
       printing; the number is not a variant mark and the chip already
       says it. */
    const base = printing({ printingName: "Roronoa Zoro (EB04-007)" });
    expect(printingVariantMark(base, "Roronoa Zoro")).toBeNull();
  });

  it("keeps the variant words when the number rides along", () => {
    /* The founder's mangled chip: "EB04-007) (Alternate Art". Two
       groups, one bracket unwrap. Now each group is read on its own. */
    const alt = printing({
      printingName: "Roronoa Zoro (EB04-007) (Alternate Art)",
    });
    expect(printingVariantMark(alt, "Roronoa Zoro")).toBe("Alternate Art");
    expect(printingLabel(alt, "Roronoa Zoro")).toBe("EB-04 · SR · Alternate Art");
  });

  it("still unwraps the simple single group", () => {
    const spr = printing({ printingName: "Kouzuki Oden (SPR)" });
    expect(printingVariantMark(spr, "Kouzuki Oden")).toBe("SPR");
  });
});

describe("which printing fronts a result", () => {
  const base = printing({ printingName: "Roronoa Zoro (EB04-007)" });
  const alt = printing({
    printingName: "Roronoa Zoro (EB04-007) (Alternate Art)",
  });
  const sp = printing({ rarity: "SP CARD", variantType: "SP" });
  const manga = printing({ variantType: "Manga" });

  it("defaults to the true base, even when the provider numbered its name", () => {
    /* The founder's screenshot: the SP art fronted the card. The base's
       name carries "(EB04-007)", which used to read as a variant mark
       and lose the tiebreak to anything named plainly. */
    const picked = pickBasePrinting([sp, alt, base], "Roronoa Zoro");
    expect(picked?.id).toBe(base.id);
  });

  it("fronts the version the query asked for", () => {
    expect(pickBasePrinting([base, alt, sp], "Roronoa Zoro", "sp")?.id).toBe(sp.id);
    expect(pickBasePrinting([base, manga, sp], "Roronoa Zoro", "manga")?.id).toBe(
      manga.id,
    );
    expect(pickBasePrinting([base, alt, sp], "Roronoa Zoro", "alt")?.id).toBe(alt.id);
  });

  it("falls back to base when the asked version does not exist", () => {
    expect(pickBasePrinting([base, alt], "Roronoa Zoro", "manga")?.id).toBe(base.id);
  });

  it("recognises a version whichever field carries the fact", () => {
    /* The same truth lives in different fields depending on the source:
       a sync's rarity code, a classification's variant_type, a name
       mark. A typed "sp" has to find all of them. */
    expect(printingMatchesAsk(sp, "Roronoa Zoro", "sp")).toBe(true);
    expect(printingMatchesAsk(printing({ rarity: "SP" }), "Roronoa Zoro", "sp")).toBe(
      true,
    );
    expect(printingMatchesAsk(manga, "Roronoa Zoro", "manga")).toBe(true);
    expect(printingMatchesAsk(base, "Roronoa Zoro", "sp")).toBe(false);
  });
});

describe("ordering a page of results by the ask", () => {
  const card = (name: string, printings: CardPrinting[]): CardResult => ({
    id: crypto.randomUUID(),
    exactName: name,
    canonicalCardNumber: "EB04-007",
    cardType: "character",
    colors: ["red"],
    traits: [],
    cost: 7,
    power: 9000,
    counter: null,
    life: null,
    rarity: "SR",
    effectText: null,
    triggerText: null,
    printings,
  });

  it("floats the cards that have the version, keeps the rest", () => {
    const plain = card("Zoro-Juurou", [printing()]);
    const withSp = card("Roronoa Zoro", [printing(), printing({ variantType: "SP" })]);

    const ordered = floatAskedVariants([plain, withSp], "sp");
    expect(ordered.map((c) => c.exactName)).toEqual(["Roronoa Zoro", "Zoro-Juurou"]);
    /* Nothing disappears: a version word is a preference, not a gate. */
    expect(ordered).toHaveLength(2);
  });

  it("changes nothing when nothing was asked", () => {
    const results = [card("A", [printing()]), card("B", [printing()])];
    expect(floatAskedVariants(results, null)).toEqual(results);
  });
});
