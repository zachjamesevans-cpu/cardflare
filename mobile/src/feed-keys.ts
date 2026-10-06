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
 * so two can never collide.
 *
 * Pure TypeScript with NO import, so tests import it: even a type-only
 * import of api.ts pulls React Native's globals (its FormData) into the
 * website's type check. The fields read are the Feed item's own
 * (`FeedItem` in api.ts); any item fits this shape.
 */
export interface KeyedFeedItem {
  kind: string;
  id?: string | null;
  postId?: string | null;
  topic?: string | null;
  code?: string | null;
  cardNumber?: string | null;
  confirmedAt?: string | null;
  playerId?: string | null;
  storeId?: string | null;
  slug?: string | null;
}

function baseKey(item: KeyedFeedItem): string {
  switch (item.kind) {
    case "announcement":
    case "recent":
      return `${item.kind}-${item.id}`;
    case "hunt":
      return `hunt-${item.postId}`;
    case "storePost":
      return `store-post-${item.postId}`;
    case "start":
      return `start-${item.topic}`;
    case "board":
      return `board-${item.code}`;
    case "traded":
      return `traded-${item.cardNumber}-${item.confirmedAt}`;
    case "added":
      return `added-${item.playerId}`;
    case "upcoming":
      return `upcoming-${item.storeId}`;
    case "pack":
      return `pack-${item.slug}`;
    default:
      /* nearbyMatch, wanted, suggest, nearbyStores, shop, and any kind
         newer than this build: one of each per feed. */
      return item.kind;
  }
}

export function feedKeys(items: readonly KeyedFeedItem[]): string[] {
  const seen = new Map<string, number>();

  return items.map((item) => {
    const base = baseKey(item);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}#${count}`;
  });
}
