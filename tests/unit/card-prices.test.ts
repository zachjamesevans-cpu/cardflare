import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { formatChange, formatPrice, shapePrices } from "@/lib/cards/price-shape";

/**
 * A card's market prices (Scrydex), on its page, on both platforms
 * (the founder, 2026-11-25: "integrate the pricing information for
 * each card into cardflare. make it a clean UI.").
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const raw = (condition: string, market: number, extra: object = {}) => ({
  type: "raw",
  condition,
  market,
  low: market - 1,
  high: market + 1,
  currency: "USD",
  ...extra,
});
const graded = (
  company: string,
  grade: string,
  market: number,
  extra: object = {},
) => ({
  type: "graded",
  company,
  grade,
  market,
  currency: "USD",
  ...extra,
});

describe("shaping Scrydex prices", () => {
  const variants = [
    { name: "altArt", prices: [raw("NM", 72), graded("PSA", "10", 182)] },
    {
      name: "foil",
      prices: [
        raw("LP", 7, {}),
        raw("NM", 6.13, { trends: { days_7: { percent_change: -2.85 } } }),
        graded("PSA", "9", 18),
        graded("PSA", "10", 75),
        graded("BGS", "10", 199),
        graded("BGS", "10", 900, { is_perfect: true }),
        graded("CGC", "10", 50, { is_signed: true }),
      ],
    },
    { name: "reprint", prices: [raw("NM", 2.59)] },
    { name: "serializedFoil", prices: [graded("PSA", "10", 11738)] },
    { name: "empty", prices: [] },
  ];
  const ids = new Map([["foil", "printing-foil"]]);
  const shaped = shapePrices(variants, ids, "2026-11-25T00:00:00.000Z");

  it("leads with the card as printed, then reprints, then alternate arts", () => {
    expect(shaped.state).toBe("ok");
    if (shaped.state !== "ok") return;
    expect(shaped.printings.map((p) => p.variant)).toEqual([
      "foil",
      "reprint",
      "altArt",
      "serializedFoil",
    ]);
  });

  it("takes near mint as the price, with its range and the week's move", () => {
    if (shaped.state !== "ok") return;
    const foil = shaped.printings[0];
    expect(foil).toMatchObject({ market: 6.13, low: 5.13, high: 7.13, change7: -2.85 });
    expect(foil.printingId).toBe("printing-foil");
    expect(foil.conditions.map((c) => c.condition)).toEqual(["NM", "LP"]);
  });

  it("names a perfect 10, leaves out signed copies, and never shows a grade twice", () => {
    if (shaped.state !== "ok") return;
    expect(shaped.printings[0].graded.map((g) => `${g.company} ${g.grade}`)).toEqual([
      "BGS Black Label",
      "PSA 10",
      "BGS 10",
      "PSA 9",
    ]);
  });

  it("keeps a printing sold only graded, and drops one with no prices", () => {
    if (shaped.state !== "ok") return;
    const serialized = shaped.printings.find((p) => p.variant === "serializedFoil");
    expect(serialized?.market).toBeNull();
    expect(serialized?.graded[0].market).toBe(11738);
    expect(shaped.printings.some((p) => p.variant === "empty")).toBe(false);
  });

  it("says when there is nothing to show", () => {
    expect(shapePrices([], ids, "x").state).toBe("none");
    expect(shapePrices(null, ids, "x").state).toBe("none");
  });

  it("formats money and movement plainly", () => {
    expect(formatPrice(3998.74)).toBe("$3,998.74");
    expect(formatPrice(0.5)).toBe("$0.50");
    expect(formatChange(-2.85)).toBe("−2.9%");
    expect(formatChange(2.85)).toBe("+2.9%");
    expect(formatChange(0.01)).toBeNull();
    expect(formatChange(null)).toBeNull();
  });
});

describe("the price panel on both platforms", () => {
  it("is on the card page of each, in the same words", () => {
    const web = read("src/components/cards/card-prices.tsx");
    const app = read("mobile/src/card-prices.tsx");
    for (const words of [
      "Market price",
      "No market price for this card yet.",
      "Prices aren't available right now.",
      "By condition",
      "Graded",
      "No ungraded sales",
    ]) {
      expect(web, words).toContain(words);
      expect(app, words).toContain(words);
    }
    expect(read("src/lib/cards/price-shape.ts")).toContain(
      'export const PRICE_SOURCE = "Market prices from Scrydex, for reference.";',
    );
    expect(app).toContain(
      'export const PRICE_SOURCE = "Market prices from Scrydex, for reference.";',
    );
    expect(read("src/app/cards/[cardId]/page.tsx")).toContain("<CardPricesSection");
    expect(read("mobile/src/screens/card.tsx")).toContain(
      "<CardPricesPanel\n        cardId={card.cardId}",
    );
  });

  it("caches each card's prices for twelve hours, never in the database", () => {
    const server = read("src/lib/cards/prices.ts");
    expect(server).toContain("export const PRICE_CACHE_SECONDS = 12 * 60 * 60;");
    expect(server).toContain("next: { revalidate: PRICE_CACHE_SECONDS");
    expect(server).not.toContain(".upsert(");
    expect(read("src/app/api/v1/cards/[cardId]/prices/route.ts")).not.toContain(
      "export const dynamic",
    );
  });
});
