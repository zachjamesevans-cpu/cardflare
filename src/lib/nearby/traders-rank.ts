/**
 * Traders near you, without a database: counting and ranking, kept
 * apart from traders.ts so the rules are unit-tested on their own.
 * Part of the UI experiment (src/lib/ui-experiment.ts).
 */

/** A nearby, opted-in player, before their binders are counted. */
export interface TraderCandidate {
  playerId: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  frame: string | null;
  /** Exact centroid distance: rounded before it leaves the server. */
  miles: number;
}

/** One pocket in a binder up for trade. */
export interface TraderCard {
  playerId: string;
  cardId: string;
  /** Copies in the pocket, 1-99. */
  quantity: number;
  game: string | null;
}

export interface Trader extends TraderCandidate {
  /** Copies up for trade (in the game asked for, when one is). */
  tradeCount: number;
  /** Distinct cards of theirs up for trade that the viewer is hunting. */
  matchCount: number;
}

export interface TraderWire extends Trader {
  milesLabel: string;
}

export type TradersAnswer =
  | { state: "off" }
  | { state: "no-location" }
  | { state: "unavailable" }
  | { state: "ok"; radius: number; hunting: number; traders: TraderWire[] };

/**
 * Count each candidate's cards up for trade and their overlap with what
 * the viewer is hunting, then rank: people with cards you hunt first
 * (most matches first), then nearest, then most cards.
 *
 * - Quantities are copies: a pocket of three is three cards.
 * - A card in two trade binders counts its copies in both (they are two
 *   real stacks), but as ONE match: a match is a card, not a copy.
 * - A game filter counts only that game's cards, for both numbers.
 * - Nobody with nothing to trade is listed: the screen is for trading.
 * - `matchingOnly` keeps only people with at least one match.
 */
export function rankTraders(
  candidates: readonly TraderCandidate[],
  cards: readonly TraderCard[],
  hunting: ReadonlySet<string>,
  options: { game?: string | null; matchingOnly?: boolean } = {},
): Trader[] {
  const counts = new Map<string, { copies: number; matched: Set<string> }>();
  for (const card of cards) {
    if (options.game && card.game !== options.game) continue;
    const quantity = Number.isFinite(card.quantity)
      ? Math.max(0, Math.floor(card.quantity))
      : 0;
    if (quantity === 0) continue;
    const entry = counts.get(card.playerId) ?? {
      copies: 0,
      matched: new Set<string>(),
    };
    entry.copies += quantity;
    if (hunting.has(card.cardId)) entry.matched.add(card.cardId);
    counts.set(card.playerId, entry);
  }

  return candidates
    .map((candidate) => {
      const entry = counts.get(candidate.playerId);
      return {
        ...candidate,
        tradeCount: entry?.copies ?? 0,
        matchCount: entry?.matched.size ?? 0,
      };
    })
    .filter((trader) => trader.tradeCount > 0)
    .filter((trader) => !options.matchingOnly || trader.matchCount > 0)
    .sort(
      (a, b) =>
        b.matchCount - a.matchCount || a.miles - b.miles || b.tradeCount - a.tradeCount,
    );
}

/** "148 cards for trade". */
export function tradeCountLine(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "card" : "cards"} for trade`;
}

/** "3 cards match your Hunts", or null for none. */
export function matchLine(count: number): string | null {
  if (count <= 0) return null;
  return `${count} ${count === 1 ? "card matches" : "cards match"} your Hunts`;
}
