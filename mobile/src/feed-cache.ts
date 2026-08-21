import AsyncStorage from "@react-native-async-storage/async-storage";

import type { FeedEntry, Me } from "./api";

/**
 * What the last open looked like, painted before this one has loaded.
 *
 * The founder: "it is quite disorienting opening the app and it slowly
 * loads all of the elements and they all kinda pop down. I think it
 * would be better if the app was 'cached' ... so when you open it, the
 * most recent saved stuff from your last open is fresh right there,
 * then it loads in the background."
 *
 * So the Feed is written to disk after every successful load and read
 * back synchronously-ish on the next open. The screen paints the old
 * feed immediately and swaps in the new one when it arrives — the
 * layout is settled before the network is, which is the entire
 * complaint.
 *
 * THREE RULES, AND THEY ARE WHY THIS IS NOT JUST A `setItem`:
 *
 * 1. KEYED TO THE ACCOUNT. A cache read by the wrong account is
 *    somebody else's feed on your phone. The key carries the player id,
 *    and a read with a different id is a miss rather than a fallback.
 *
 * 2. IT EXPIRES. The Feed says "a room is open right now" and "4d ago".
 *    Painting a day-old copy of that is not a stale render, it is a
 *    false statement — so anything past MAX_AGE is dropped and the
 *    screen loads the way it always did. A few seconds of wrong is the
 *    price of no pop-in; a day of wrong is not.
 *
 * 3. IT IS A PAINT, NOT A SOURCE OF TRUTH. Nothing acts on cached data.
 *    The refresh is already in flight when the cache is painted, and
 *    every tap the screen offers goes to the network anyway.
 */
const KEY_PREFIX = "cardflare.feed.v1";

/*
 * Who the last cache belongs to.
 *
 * The chicken and egg this file has to solve: the cache is keyed by
 * player id so one account can never paint another's feed, but the id
 * comes from `getMe()` — the network call the cache exists to paint
 * ahead of. Waiting for it would defeat the whole thing.
 *
 * So the id is written beside the cache and read first. It is a pointer,
 * not a credential: nothing is authorised by it, and a wrong or stale
 * one produces a miss rather than somebody else\'s feed, because the
 * real key still has to match.
 */
const LAST_ACCOUNT_KEY = `${KEY_PREFIX}.last`;

/*
 * Six hours. Long enough to cover "I opened it this morning and again
 * at lunch", short enough that nothing on a Feed built around tonight
 * survives into a different evening.
 */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface CachedFeed {
  me: Me | null;
  items: FeedEntry[];
  /** When it was written, as epoch ms. */
  at: number;
}

const keyFor = (playerId: string) => `${KEY_PREFIX}.${playerId}`;

/**
 * The last feed for this account, if it is still worth showing.
 *
 * Returns null for a miss, a different account, a corrupt payload, or
 * anything older than MAX_AGE. Every one of those is a normal outcome
 * and none of them is an error worth telling anybody about — the screen
 * simply loads the way it did before this file existed.
 */
export async function readFeedCache(playerId: string): Promise<CachedFeed | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(playerId));
    if (!raw) return null;

    const cached = JSON.parse(raw) as CachedFeed;

    if (!Array.isArray(cached.items) || typeof cached.at !== "number") return null;
    if (Date.now() - cached.at > MAX_AGE_MS) return null;

    return cached;
  } catch {
    /* A cache that cannot be read is a cache that is not used. It must
       never be the reason the app fails to open. */
    return null;
  }
}

/** Whose feed was cached last, or null on a fresh install. */
export async function cachedPlayerId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

export async function writeFeedCache(
  playerId: string,
  me: Me | null,
  items: FeedEntry[],
): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [keyFor(playerId), JSON.stringify({ me, items, at: Date.now() } satisfies CachedFeed)],
      [LAST_ACCOUNT_KEY, playerId],
    ]);
  } catch {
    /* Out of space, or a payload that will not serialise. The feed on
       screen is already correct; failing to remember it for next time
       is not worth interrupting anybody over. */
  }
}

/**
 * Forget everything, on sign-out.
 *
 * Sweeps every account's entry rather than the current one, because
 * whoever is signing out may not be whoever the key names — and a feed
 * left on a phone that has been handed to somebody else is the one
 * failure of this file that would actually matter.
 */
export async function clearFeedCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((key) => key.startsWith(KEY_PREFIX));

    if (ours.length > 0) await AsyncStorage.multiRemove(ours);
  } catch {
    /* Nothing to do about it, and nothing worth saying. */
  }
}

export const FEED_CACHE_MAX_AGE_MS = MAX_AGE_MS;
