import type { FeedItem } from "./api";

/**
 * A React key for every Feed row that survives the list changing.
 *
 * The rows were keyed by position, so a post arriving at the top shifted
 * every key under it: React handed one row's state (a half-typed comment,
 * a picked card, an image already decoded) to the row beneath. A key
 * from the item's own id stays with the item.
 *
 * Kinds that carry no id (the "start" nudge, a suggestions strip) are
 * singletons in practice; a repeat of the same base key gets a counter
 * so two can never collide. Pure TypeScript, so tests import it.
 */
function baseKey(item: FeedItem): string {
  switch (item.kind) {
    case "announcement":
      return `announcement-${item.id}`;
    case "start":
      return `start-${item.topic}`;
    case "board":
      return `board-${item.code}`;
    case "traded":
      return `traded-${item.cardNumber}-${item.confirmedAt}`;
    case "added":
      return `added-${item.playerId}`;
    case "hunt":
      return `hunt-${item.postId}`;
    case "upcoming":
      return `upcoming-${item.storeId}`;
    case "recent":
      return `recent-${item.id}`;
    case "storePost":
      return `store-post-${item.postId}`;
    case "pack":
      return `pack-${item.slug}`;
    default:
      /* nearbyMatch, wanted, suggest, nearbyStores, shop, and any kind
         newer than this build: one of each per feed. */
      return (item as { kind: string }).kind;
  }
}

export function feedKeys(items: readonly FeedItem[]): string[] {
  const seen = new Map<string, number>();

  return items.map((item) => {
    const base = baseKey(item);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}#${count}`;
  });
}
