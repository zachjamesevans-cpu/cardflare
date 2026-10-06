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

describe("buying and opening, where the money moves", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/packs/repository.ts"),
    "utf8",
  );

  it("refunds a failed purchase under a ref only that purchase can use", () => {
    /* ember_ledger.ref is unique across every player: a per-series
       refund ref paid back the first failure ever and nobody since. */
    expect(source).not.toMatch(/`pack-refund:\$\{series\.id\}`/);
    expect(source).toContain("`pack-refund:${series.id}:${playerId}:${purchase}`");
    expect(source).toContain("`pack:${series.id}:${purchase}`");
  });

  it("never reports a pull as won when its row did not land", () => {
    const failed = source.slice(source.indexOf('"Could not grant a pull"'));
    expect(failed).toContain("duplicate: true");
    expect(failed).toContain("embersInstead: compensated ? DUPLICATE_EMBERS : 0");
    /* The won branch is only reached when the insert had no error. */
    expect(source).toMatch(/if \(!error\) \{\s*owned\.add\(entry\.slug\);/);
  });
});

describe("the weekly ceiling when the ledger cannot be read", () => {
  it("counts the week as full rather than empty", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/players/embers.ts"),
      "utf8",
    );
    const week = source.slice(source.indexOf("async function weekEarned"));
    const body = week.slice(0, week.indexOf("\n}\n"));
    expect(body).toContain("return WEEKLY_CEILING;");
    expect(body).not.toMatch(/return 0;/);
  });
});
