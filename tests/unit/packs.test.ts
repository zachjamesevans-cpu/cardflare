import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SERIES, drawOne, drawPack, oddsByRarity } from "@/lib/packs";

/**
 * The pack maths, pinned. Odds are a promise printed in the store, so
 * a series that does not sum to exactly 100 is a lie waiting to ship,
 * and a slug not in the migrations is an unwinnable card.
 */

const migrationSql = readdirSync(join(process.cwd(), "supabase/migrations"))
  .map((file) => readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8"))
  .join("\n");

describe("pack series", () => {
  it("every series' weights sum to exactly 100", () => {
    for (const series of Object.values(SERIES)) {
      const total = series.pool.reduce((sum, entry) => sum + entry.weight, 0);
      expect(total, series.id).toBeCloseTo(100, 6);
    }
  });

  it("every slug in every pool exists in the migrations", () => {
    for (const series of Object.values(SERIES)) {
      for (const entry of series.pool) {
        expect(migrationSql, `${series.id}: ${entry.slug}`).toContain(
          `'${entry.slug}'`,
        );
      }
    }
  });

  it("galaxy foil is the rarest pull in Origin, by decree", () => {
    const origin = SERIES.origin;
    const galaxy = origin.pool.find((entry) => entry.slug === "galaxy-holo");
    expect(galaxy).toBeDefined();
    for (const entry of origin.pool) {
      if (entry.slug === "galaxy-holo") continue;
      expect(entry.weight).toBeGreaterThan(galaxy!.weight);
    }
  });

  it("draws are deterministic for a fixed roll", () => {
    const origin = SERIES.origin;
    expect(drawOne(origin, 0).slug).toBe(origin.pool[0].slug);
    /* The last sliver of the number line lands on the last entry. */
    expect(drawOne(origin, 0.9999999).slug).toBe(
      origin.pool[origin.pool.length - 1].slug,
    );
  });

  it("a pack is always exactly slots pulls with no duplicates", () => {
    const origin = SERIES.origin;
    /* Identical rolls force the duplicate path on every draw. */
    const pulls = drawPack(origin, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    expect(pulls).toHaveLength(origin.slots);
    expect(new Set(pulls.map((entry) => entry.slug)).size).toBe(origin.slots);
  });

  it("the odds table covers the whole pool and sums to 100", () => {
    for (const series of Object.values(SERIES)) {
      const odds = oddsByRarity(series);
      const total = odds.reduce((sum, tier) => sum + tier.percent, 0);
      expect(total).toBeCloseTo(100, 6);
      const slugs = odds.flatMap((tier) => tier.slugs);
      expect(slugs.sort()).toEqual(series.pool.map((entry) => entry.slug).sort());
    }
  });
});
