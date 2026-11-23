/**
 * Recently viewed cards (the UI experiment's Search), as a list: pure,
 * so tests/unit/ui-experiment.test.ts reads it without a phone. Stored
 * by recent-cards.ts under the cache's prefix, so signing out sweeps it.
 *
 * Only what a tile needs to draw itself: the card, one printing's
 * label and art, and its game. Nothing about the viewer.
 */
export const RECENT_CARDS_LIMIT = 12;

const PREFIX = "cardflare.cache.v2.recent-cards";

export interface RecentCard {
  cardId: string;
  name: string;
  cardNumber: string;
  label: string | null;
  imageUrl: string | null;
  game: string | null;
}

export function recentCardsKey(account: string | null): string {
  return `${PREFIX}.${account ?? "guest"}`;
}

/** `card` first, any older copy of it gone, the list cut to the limit. */
export function withRecentCard(
  list: readonly RecentCard[],
  card: RecentCard,
): RecentCard[] {
  return [card, ...list.filter((item) => item.cardId !== card.cardId)].slice(
    0,
    RECENT_CARDS_LIMIT,
  );
}

function isRecentCard(value: unknown): value is RecentCard {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.cardId === "string" &&
    item.cardId !== "" &&
    typeof item.name === "string" &&
    typeof item.cardNumber === "string"
  );
}

/** A stored list, or empty for anything unreadable. */
export function parseRecentCards(raw: string | null): RecentCard[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isRecentCard)
      .map((item) => ({
        cardId: item.cardId,
        name: item.name,
        cardNumber: item.cardNumber,
        label: typeof item.label === "string" ? item.label : null,
        imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null,
        game: typeof item.game === "string" ? item.game : null,
      }))
      .slice(0, RECENT_CARDS_LIMIT);
  } catch {
    return [];
  }
}
