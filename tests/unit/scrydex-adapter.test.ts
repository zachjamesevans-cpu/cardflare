import { describe, expect, it } from "vitest";

import {
  ScrydexProvider,
  uniquePrintings,
  variantLabel,
} from "@/lib/cards/providers/scrydex/adapter";

/** Scrydex, the one card source (2026-11-25): shapes, not the network. */
describe("the Scrydex adapter", () => {
  const provider = new ScrydexProvider("one-piece");

  const record = {
    id: "OP18-022",
    name: "Monkey.D.Luffy",
    type: "Leader",
    colors: ["Green"],
    power: "5000",
    life: "5",
    rarity: "Leader",
    language_code: "EN",
    rules: ["[When Attacking] ..."],
    subtypes: ["Straw Hat Crew"],
    expansion: { id: "OP18", code: "OP18", name: "The Dominance of God" },
    images: [
      { type: "front", large: "https://images.scrydex.com/onepiece/OP18-022/large" },
    ],
    variants: [
      {
        name: "normal",
        images: [
          {
            type: "front",
            large: "https://images.scrydex.com/onepiece/OP18-022/large",
          },
        ],
      },
      {
        name: "altArt",
        images: [
          {
            type: "front",
            large: "https://images.scrydex.com/onepiece/OP18-022A/large",
          },
        ],
      },
      {
        name: "altArt",
        images: [
          {
            type: "front",
            large: "https://images.scrydex.com/onepiece/OP18-022B/large",
          },
        ],
      },
    ],
  };

  it("makes a Scrydex card one card, each variant one printing with its own art", () => {
    const result = provider.normalizeCard(record);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.canonicalCardNumber).toBe("OP18-022");
    expect(result.card.power).toBe(5000);
    expect(result.card.life).toBe(5);
    expect(result.card.printings.map((p) => p.providerExternalId)).toEqual([
      "OP18-022:normal",
      "OP18-022:altArt",
      "OP18-022:altArt:2",
    ]);
    expect(result.card.printings[2].imageUrl).toBe(
      "https://images.scrydex.com/onepiece/OP18-022B/large",
    );
    expect(result.card.printings[1].printingLabel).toBe("OP18 · Leader · Alt Art");
    expect(result.card.printings[1].isAlternateArt).toBe(true);
  });

  it("keeps two same-named variants apart, stably", () => {
    const ids = uniquePrintings([
      { providerExternalId: "a" },
      { providerExternalId: "a" },
      { providerExternalId: "b" },
      { providerExternalId: "a" },
    ]).map((p) => p.providerExternalId);
    expect(ids).toEqual(["a", "a:2", "b", "a:3"]);
  });

  it("refuses a card that is not English", () => {
    expect(provider.normalizeCard({ ...record, language_code: "JA" }).ok).toBe(false);
  });

  it("names a variant the way a person would", () => {
    expect(variantLabel("altArt")).toBe("Alt Art");
    expect(variantLabel("unlimitedHolofoil")).toBe("Unlimited Holofoil");
  });
});
