/**
 * Fair share on the wall.
 *
 * The founder asked what happens when somebody walks in with a hundred
 * Flares. Before this: the wall took the newest 24 cards in the room,
 * so one big list owned the whole television for a while and three
 * people with two cards each were pushed off it.
 *
 * Now the list is dealt out like cards at a table: everyone's first,
 * then everyone's second, and so on, until the wall is full. Each
 * person brings at most their SHARE to the deal: ten cards on a free
 * account, every card on Pro and up. The board itself is never gated,
 * only how much of the television one person's list can take.
 *
 * A card several people want is the most useful thing a wall can show
 * ("3 people are looking for this"), so those lead, outside anybody's
 * share.
 *
 * Pure, so tests/unit/wall-share.test.ts can deal a few hands.
 */

/** A free account's share of the wall. Pro and up bring everything. */
export const FREE_WALL_SHARE = 10;

/**
 * Deals `cards` out by owner, round-robin, up to `limit`.
 *
 * `ownerOf` names the person a card belongs to (null for a card several
 * people want, which leads the list). `shareOf` says how many cards
 * that person may bring; `Infinity` for no cap. Order inside a person's
 * hand is preserved, so "newest first" still holds within a list.
 */
export function dealWallShare<T>(
  cards: readonly T[],
  ownerOf: (card: T) => string | null,
  shareOf: (owner: string) => number,
  limit: number,
): T[] {
  if (limit <= 0 || cards.length === 0) return [];

  const shared: T[] = [];
  const hands = new Map<string, T[]>();

  for (const card of cards) {
    const owner = ownerOf(card);
    if (owner === null) {
      shared.push(card);
      continue;
    }
    const hand = hands.get(owner) ?? [];
    if (hand.length < shareOf(owner)) hand.push(card);
    hands.set(owner, hand);
  }

  const dealt: T[] = shared.slice(0, limit);
  const order = [...hands.values()];
  let round = 0;
  while (dealt.length < limit) {
    let drew = false;
    for (const hand of order) {
      if (dealt.length >= limit) break;
      const card = hand[round];
      if (card === undefined) continue;
      dealt.push(card);
      drew = true;
    }
    if (!drew) break;
    round += 1;
  }

  return dealt;
}
