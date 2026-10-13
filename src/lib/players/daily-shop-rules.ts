/**
 * The daily shop's rotation: which cosmetics are on the shelf today.
 *
 * From the Embers review (2026-10-11), step 5: a few cosmetics on sale
 * each day, changing at midnight UTC, so there is a reason to look in
 * and the catalogue is discovered a handful at a time rather than as a
 * two-hundred-item list. Everyone sees the same shelf on the same day -
 * a shop, not a slot machine.
 *
 * Pure: a day and the pool in, today's slugs out. The database side is
 * daily-shop.ts.
 */

/** One cosmetic on today's shelf. */
export interface DailyOffer {
  slug: string;
  /** The catalogue kind: ring, aura, border, pattern and the rest. */
  kind: string;
  name: string;
  description: string;
  costEmbers: number;
  owned: boolean;
  /** Lifetime Embers needed first, or null. */
  requiresEarned: number | null;
}

export interface DailyShelf {
  offers: DailyOffer[];
  resetsAt: string;
}

/** How many cosmetics are on the shelf each day. */
export const DAILY_OFFERS = 4;

/** The UTC date a shelf belongs to, "2026-10-11". */
export function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** When today's shelf is replaced: the next UTC midnight. */
export function resetsAt(now: Date): string {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
}

/* FNV-1a: a small, stable hash, so a day always deals the same hand. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

/** Today's shelf: the pool shuffled by the day, the first few taken. */
export function rotate(pool: string[], day: string, count = DAILY_OFFERS): string[] {
  return [...new Set(pool)]
    .map((slug) => ({ slug, order: hash(`${day}:${slug}`) }))
    .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
    .slice(0, count)
    .map((entry) => entry.slug);
}
