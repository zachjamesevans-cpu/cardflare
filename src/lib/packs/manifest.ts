/**
 * What a pack series is, structurally. Pure types and pure math - no
 * server imports, so odds render anywhere and tests stay unit tests.
 */

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export const RARITY_ORDER: Rarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
];

export interface PoolEntry {
  slug: string;
  rarity: Rarity;
  /** Percent chance per slot. A series' weights sum to exactly 100. */
  weight: number;
}

export interface SeriesManifest {
  id: string;
  name: string;
  setNumber: number;
  priceEmbers: number;
  /** Cosmetics per opening. */
  slots: number;
  pool: PoolEntry[];
}

/** Embers handed over when a pull is something the player already owns. */
export const DUPLICATE_EMBERS = 40;

/**
 * One weighted draw. `roll` is 0..1 from the caller - the server passes
 * crypto randomness, tests pass fixed numbers and get fixed answers.
 */
export function drawOne(series: SeriesManifest, roll: number): PoolEntry {
  const total = series.pool.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = roll * total;

  for (const entry of series.pool) {
    cursor -= entry.weight;
    if (cursor < 0) return entry;
  }
  return series.pool[series.pool.length - 1];
}

/**
 * A full pack: `slots` draws with no duplicate slugs within the pack.
 * Rolls beyond the first `slots` cover re-draws; the caller supplies
 * plenty.
 */
export function drawPack(series: SeriesManifest, rolls: number[]): PoolEntry[] {
  const picked: PoolEntry[] = [];
  for (const roll of rolls) {
    if (picked.length >= series.slots) break;
    const entry = drawOne(series, roll);
    if (!picked.some((existing) => existing.slug === entry.slug)) {
      picked.push(entry);
    }
  }
  /* Pathologically unlucky rolls fall back to the top of the pool so a
     pack is never short - visible only if the caller under-supplies. */
  for (const entry of series.pool) {
    if (picked.length >= series.slots) break;
    if (!picked.some((existing) => existing.slug === entry.slug)) picked.push(entry);
  }
  return picked;
}

/** The store's "what can be inside" table: rarity, names, percents. */
export function oddsByRarity(
  series: SeriesManifest,
): { rarity: Rarity; slugs: string[]; percent: number }[] {
  return RARITY_ORDER.flatMap((rarity) => {
    const entries = series.pool.filter((entry) => entry.rarity === rarity);
    if (entries.length === 0) return [];
    return [
      {
        rarity,
        slugs: entries.map((entry) => entry.slug),
        percent: entries.reduce((sum, entry) => sum + entry.weight, 0),
      },
    ];
  });
}
