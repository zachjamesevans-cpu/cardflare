import AsyncStorage from "@react-native-async-storage/async-storage";

import { cachedPlayerId } from "./cache";
import { RECENT_LIMIT, parseRecent, recentKey } from "./recent-search-list";

/**
 * Recent searches, kept on this phone: the website's
 * src/components/feed/recent-searches.ts, with AsyncStorage where the
 * browser has localStorage. One list per account, keyed the way
 * src/cache.ts keys everything (by the account the cache last
 * belonged to), and under the cache's own prefix so signing out
 * sweeps it with the rest.
 *
 * Every read and write swallows: a search that cannot remember must
 * still search, and an unreadable list is an empty one.
 */

/** This account's list, newest first. */
export async function readRecent(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(recentKey(await cachedPlayerId()));
    return parseRecent(raw);
  } catch {
    return [];
  }
}

/** Keep `list` as this account's, or forget it when it is empty. */
export async function writeRecent(list: readonly string[]): Promise<void> {
  try {
    const key = recentKey(await cachedPlayerId());
    if (list.length === 0) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, JSON.stringify(list.slice(0, RECENT_LIMIT)));
  } catch {
    /* Remembering is a convenience; the search already happened. */
  }
}
