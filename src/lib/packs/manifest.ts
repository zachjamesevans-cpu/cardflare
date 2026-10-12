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
/**
 * THE PITY RULE: after this many packs of a set in a row without an
 * Epic or better, the next is guaranteed one. From the Embers review
 * (2026-10-11), step 5: duplicates came back as 40 Embers of a 300-Ember
 * pack, so a long run of commons was money down a well. Counted per
 * player per set, and reset by any Epic or Legendary pull.
 */
export const PITY_AFTER = 9;

const TOP: Rarity[] = ["epic", "legendary"];

/** Whether a pull is the kind the pity rule promises. */
export function isTopPull(entry: Pick<PoolEntry, "rarity">): boolean {
  return TOP.includes(entry.rarity);
}

/**
 * A pack drawn with the pity rule: when `packsWithoutTop` has reached
 * PITY_AFTER, the first slot is drawn from the set's Epic and Legendary
 * entries alone (by their own weights), and the rest as usual. A set
 * with nothing that rare draws as usual.
 */
export function drawPackWithPity(
  series: SeriesManifest,
  rolls: number[],
  packsWithoutTop: number,
): PoolEntry[] {
  const top = series.pool.filter(isTopPull);
  if (packsWithoutTop < PITY_AFTER || top.length === 0) return drawPack(series, rolls);

  const guaranteed = drawOne({ ...series, pool: top }, rolls[0] ?? 0);
  const rest = drawPack(
    {
      ...series,
      slots: series.slots - 1,
      pool: series.pool.filter((entry) => entry.slug !== guaranteed.slug),
    },
    rolls.slice(1),
  );
  return [guaranteed, ...rest];
}

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

/** Every item with its own exact per-slot percent, grouped by rarity
    with the rarest tier last - the order the popup prints. */
export function oddsPerItem(
  series: SeriesManifest,
): { rarity: Rarity; items: { slug: string; percent: number }[] }[] {
  return RARITY_ORDER.flatMap((rarity) => {
    const entries = series.pool.filter((entry) => entry.rarity === rarity);
    if (entries.length === 0) return [];
    return [
      {
        rarity,
        items: entries.map((entry) => ({ slug: entry.slug, percent: entry.weight })),
      },
    ];
  });
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
