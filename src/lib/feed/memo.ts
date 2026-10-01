import "server-only";

import type { FeedEntry } from "./repository";

/**
 * The Feed, remembered for a moment.
 *
 * The three tabs are filters over ONE list, and every tap rebuilt the
 * whole list from a dozen queries: the audit measured four to seven
 * seconds a tab. Remembering the list per player for half a minute
 * makes the second and third tab instant on a warm function, and the
 * things that change what a player should see (posting, taking down,
 * blocking) forget it on the spot. Half a minute is short enough that
 * a friend's new Flare is never far away, and the app, which reads
 * through the API with its own coordinates, is not cached here at all.
 */

const TTL_MS = 30 * 1000;
const CAP = 500;

const remembered = new Map<string, { at: number; feed: Promise<FeedEntry[]> }>();

export function rememberFeed(
  playerId: string,
  build: () => Promise<FeedEntry[]>,
  now = Date.now(),
): Promise<FeedEntry[]> {
  const hit = remembered.get(playerId);
  if (hit && now - hit.at < TTL_MS) return hit.feed;

  if (remembered.size >= CAP) {
    const oldest = remembered.keys().next().value;
    if (oldest !== undefined) remembered.delete(oldest);
  }

  const feed = build().catch((error) => {
    /* A failed build is not worth remembering. */
    remembered.delete(playerId);
    throw error;
  });
  remembered.set(playerId, { at: now, feed });
  return feed;
}

export function forgetFeed(playerId: string): void {
  remembered.delete(playerId);
}
