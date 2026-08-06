import { describe, expect, it } from "vitest";

import {
  normalizeProductName,
  resolvePrintingId,
} from "@/lib/players/collection-match";

/**
 * The name-equality rule that pins a Collectr row to a catalog printing.
 * The pilot bug this exists for: an alt-art Perona in the file, a Flare
 * for that exact alt art on the board, and the room saying "another
 * printing". Equality of the provider's own words is evidence; anything
 * short of it stays printing-unknown rather than guessed.
 */

const PERONA = [
  { id: "base", printingName: "Perona" },
  { id: "alt", printingName: "Perona (Alternate Art)" },
];

describe("resolvePrintingId", () => {
  it("pins the pilot's alt-art Perona to the alt-art printing", () => {
    expect(resolvePrintingId("Perona (Alternate Art)", PERONA)).toBe("alt");
  });

  it("pins a plain product name to the base printing", () => {
    expect(resolvePrintingId("Perona", PERONA)).toBe("base");
  });

  it("shrugs off case, spacing and punctuation conventions", () => {
    const printings = [
      { id: "luffy", printingName: "Monkey D Luffy (012) (Alternate Art)" },
    ];

    expect(resolvePrintingId("Monkey.D.Luffy  (012) (Alternate Art)", printings)).toBe(
      "luffy",
    );
  });

  it("returns null when the catalog has no printing by that name", () => {
    expect(resolvePrintingId("Perona (Manga)", PERONA)).toBeNull();
  });

  it("returns null when two printings answer to the same name", () => {
    const printings = [
      { id: "a", printingName: "Nami (Alternate Art)" },
      { id: "b", printingName: "Nami (Alternate Art)" },
    ];

    expect(resolvePrintingId("Nami (Alternate Art)", printings)).toBeNull();
  });

  it("never matches a printing the provider left unnamed", () => {
    expect(resolvePrintingId("", [{ id: "x", printingName: null }])).toBeNull();
    expect(resolvePrintingId("Perona", [{ id: "x", printingName: null }])).toBeNull();
  });
});

describe("normalizeProductName", () => {
  it("keeps the words and the parenthetical structure", () => {
    expect(normalizeProductName("Eustass“Captain”Kid")).not.toBe("");
    expect(normalizeProductName("Perona (Alternate Art)")).toBe(
      "perona (alternate art)",
    );
    expect(normalizeProductName("Monkey.D.Luffy - ST01-012")).toBe(
      "monkey d luffy st01 012",
    );
  });
});
