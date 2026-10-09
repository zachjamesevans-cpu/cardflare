import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { cardArt, type CardPrinting } from "@/lib/cards/schema";

/**
 * The picture a card row sends.
 *
 * Several call sites reached for a sibling printing's art only when the row
 * named no printing, so a Flare on a specific printing with no scan came
 * back null and drew as a black tile on a profile, even though the card's
 * other printings had art. The founder found two on one profile.
 */
const OWN = "https://optcgapi.com/media/static/Card_Images/OP12-034_p1.jpg";
const BASE = "https://optcgapi.com/media/static/Card_Images/OP12-034.jpg";

const printing = (over: Partial<CardPrinting> = {}): CardPrinting => ({
  id: crypto.randomUUID(),
  setCode: "OP12",
  setName: "Legacy of the Master",
  printingLabel: "OP12",
  variantType: null,
  rarity: "C",
  printingName: "Perona",
  isPromo: null,
  imageUrl: BASE,
  ...over,
});

describe("cardArt", () => {
  it("uses the printing's own art when it has some", () => {
    expect(cardArt(OWN, [printing()], "Perona")).toBe(OWN);
  });

  it("borrows an imaged sibling's art when the printing has none", () => {
    const unscanned = printing({
      printingName: "Perona (Alternate Art)",
      imageUrl: null,
    });
    const base = printing();

    expect(cardArt(null, [unscanned, base], "Perona")).toBe(BASE);
    expect(cardArt(undefined, [unscanned, base], "Perona")).toBe(BASE);
    expect(cardArt("", [unscanned, base], "Perona")).toBe(BASE);
  });

  it("is null when no printing of the card has art", () => {
    expect(cardArt(null, [printing({ imageUrl: null })], "Perona")).toBeNull();
    expect(cardArt(null, [], "Perona")).toBeNull();
  });
});

/*
 * Every server site that sends a card image goes through `cardArt`, so a new
 * or rewritten one cannot quietly go back to "named printing's art or null".
 */
describe("card image call sites", () => {
  it.each([
    "src/lib/players/wants.ts",
    "src/lib/players/profile.ts",
    "src/lib/binder/binder.ts",
    "src/lib/local/feed.ts",
    "src/lib/lists/repository.ts",
    "src/lib/feed/posts.ts",
    "src/lib/trades/history.ts",
  ])("%s resolves art through cardArt", (path) => {
    const source = readFileSync(path, "utf8");

    expect(source).toMatch(
      /import\s*{[^}]*\bcardArt\b[^}]*}\s*from\s*"@\/lib\/cards\/schema"/,
    );
    expect(source).toMatch(/imageUrl:\s*cardArt\(/);
    /* The unfiltered first-row-per-card shortcut that could pick a null. */
    expect(source).not.toMatch(/artByCard/);
  });
});
