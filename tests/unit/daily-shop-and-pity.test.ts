import { describe, expect, it } from "vitest";

import {
  PITY_AFTER,
  drawPackWithPity,
  isTopPull,
  type SeriesManifest,
} from "@/lib/packs/manifest";
import { DAILY_OFFERS, dayKey, resetsAt, rotate } from "@/lib/players/daily-shop-rules";

/**
 * From the Embers review (2026-10-11), step 5: a daily shop so there is
 * a reason to look in and the catalogue is found a few at a time, and a
 * pity rule so a long run of duplicates is never money down a well.
 */

describe("the daily shop", () => {
  const pool = ["a", "b", "c", "d", "e", "f", "g", "h"];

  it("puts the same few on everyone's shelf for a day", () => {
    const today = rotate(pool, "2026-10-11");
    expect(today).toHaveLength(DAILY_OFFERS);
    expect(rotate([...pool].reverse(), "2026-10-11")).toEqual(today);
    expect(new Set(today).size).toBe(today.length);
  });

  it("changes the shelf from one day to the next", () => {
    const days = ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14"];
    const shelves = new Set(days.map((day) => rotate(pool, day).join(",")));
    expect(shelves.size).toBeGreaterThan(1);
  });

  it("shows the whole pool when it is smaller than a shelf", () => {
    expect(rotate(["x", "y"], "2026-10-11").sort()).toEqual(["x", "y"]);
  });

  it("turns over at the next UTC midnight", () => {
    const now = new Date("2026-10-11T15:30:00Z");
    expect(dayKey(now)).toBe("2026-10-11");
    expect(resetsAt(now)).toBe("2026-10-12T00:00:00.000Z");
  });
});

describe("the pity rule", () => {
  const series: SeriesManifest = {
    id: "test",
    name: "Test",
    setNumber: 9,
    priceEmbers: 300,
    slots: 3,
    pool: [
      { slug: "c1", rarity: "common", weight: 40 },
      { slug: "c2", rarity: "common", weight: 40 },
      { slug: "u1", rarity: "uncommon", weight: 15 },
      { slug: "e1", rarity: "epic", weight: 4 },
      { slug: "l1", rarity: "legendary", weight: 1 },
    ],
  };
  /* Rolls that land on commons every time. */
  const unlucky = Array.from({ length: 18 }, (_, index) => (index % 2) * 0.4 + 0.05);

  it("draws as usual before the run is long enough", () => {
    const pulls = drawPackWithPity(series, unlucky, PITY_AFTER - 1);
    expect(pulls).toHaveLength(3);
    expect(pulls.some(isTopPull)).toBe(false);
  });

  it("guarantees an Epic or better once the run reaches the rule", () => {
    const pulls = drawPackWithPity(series, unlucky, PITY_AFTER);
    expect(pulls).toHaveLength(3);
    expect(isTopPull(pulls[0])).toBe(true);
    expect(new Set(pulls.map((pull) => pull.slug)).size).toBe(3);
  });

  it("draws as usual for a set with nothing that rare", () => {
    const plain = { ...series, pool: series.pool.filter((entry) => !isTopPull(entry)) };
    expect(drawPackWithPity(plain, unlucky, 50).some(isTopPull)).toBe(false);
  });

  it("is promised after nine packs, not some other number", () => {
    expect(PITY_AFTER).toBe(9);
  });
});
