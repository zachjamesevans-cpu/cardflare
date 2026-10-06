/**
 * Pockets, worked out the same way everywhere: the database's
 * `binder_place_card`, the website's binder and the app's. This is
 * the website's src/lib/binder/pocket-math.ts, word for word, and
 * tests/unit/pocket-math.test.ts walks both through the same moves.
 *
 * A pocket is a place: page 1 is 0 to 8, page 2 is 9 to 17. Gaps are
 * real. A card dropped on an empty pocket goes there; dropped on a full
 * one, the run of cards from that pocket slides along by one to the
 * next gap, and the card takes the pocket. Never a swap, never a lost
 * card. The screen paints this at once; the server's answer follows.
 */

export const POCKETS_PER_PAGE = 9;
/** The last pocket a binder has: 100 pages of nine. */
export const LAST_POCKET = 899;

export interface Pocketed {
  entryId: string;
  pocket: number;
}

/**
 * The next empty pocket at or after `from`, coming round to the start
 * when the end is full. Null when every pocket is taken.
 */
export function nextFreePocket(taken: Set<number>, from: number): number | null {
  const start = Math.min(Math.max(0, Math.floor(from)), LAST_POCKET);
  for (let pocket = start; pocket <= LAST_POCKET; pocket += 1) {
    if (!taken.has(pocket)) return pocket;
  }
  for (let pocket = 0; pocket < start; pocket += 1) {
    if (!taken.has(pocket)) return pocket;
  }
  return null;
}

/** `cards` after `entryId` is dropped on `pocket`, as the database does it. */
export function placeInPockets<T extends Pocketed>(
  cards: readonly T[],
  entryId: string,
  pocket: number,
): T[] {
  const moving = cards.find((card) => card.entryId === entryId);
  if (!moving || pocket < 0 || pocket > LAST_POCKET) return [...cards];
  const others = cards.filter((card) => card.entryId !== entryId);
  const taken = new Set(others.map((card) => card.pocket));

  let shifted = others;
  if (taken.has(pocket)) {
    let gap = pocket;
    while (gap <= LAST_POCKET && taken.has(gap)) gap += 1;
    if (gap > LAST_POCKET) return [...cards];
    shifted = others.map((card) =>
      card.pocket >= pocket && card.pocket < gap
        ? { ...card, pocket: card.pocket + 1 }
        : card,
    );
  }

  return [...shifted, { ...moving, pocket }].sort((a, b) => a.pocket - b.pocket);
}

/**
 * How many pages to draw: enough to reach the last card, and for the
 * owner one more page of empty pockets once the last page is full, so
 * there is always somewhere to put the next card.
 */
export function pagesFor(cards: readonly Pocketed[], owner: boolean): number {
  const last = cards.reduce((max, card) => Math.max(max, card.pocket), -1);
  const used = Math.max(1, Math.ceil((last + 1) / POCKETS_PER_PAGE));
  if (!owner) return used;
  const lastPageFull = cards.filter(
    (card) => Math.floor(card.pocket / POCKETS_PER_PAGE) === used - 1,
  ).length;
  return lastPageFull >= POCKETS_PER_PAGE ? used + 1 : used;
}

/** The cards on one page, by pocket within the page (0 to 8), gaps as undefined. */
export function pageOf<T extends Pocketed>(
  cards: readonly T[],
  page: number,
): (T | undefined)[] {
  const slots: (T | undefined)[] = Array.from({ length: POCKETS_PER_PAGE });
  for (const card of cards) {
    const at = card.pocket - page * POCKETS_PER_PAGE;
    if (at >= 0 && at < POCKETS_PER_PAGE) slots[at] = card;
  }
  return slots;
}
