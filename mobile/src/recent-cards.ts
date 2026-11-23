import AsyncStorage from "@react-native-async-storage/async-storage";

import { cachedPlayerId } from "./cache";
import {
  parseRecentCards,
  recentCardsKey,
  withRecentCard,
  type RecentCard,
} from "./recent-card-list";

/**
 * Recently viewed cards on this phone, one list per account, the way
 * recent-searches.ts keeps searches. Every read and write swallows: a
 * search that cannot remember must still search.
 */
export async function readRecentCards(): Promise<RecentCard[]> {
  try {
    return parseRecentCards(await AsyncStorage.getItem(recentCardsKey(await cachedPlayerId())));
  } catch {
    return [];
  }
}

/** Put `card` first; returns the new list. */
export async function rememberCard(card: RecentCard): Promise<RecentCard[]> {
  const next = withRecentCard(await readRecentCards(), card);
  try {
    await AsyncStorage.setItem(
      recentCardsKey(await cachedPlayerId()),
      JSON.stringify(next),
    );
  } catch {
    /* A convenience; the card still opens. */
  }
  return next;
}

export async function clearRecentCards(): Promise<void> {
  try {
    await AsyncStorage.removeItem(recentCardsKey(await cachedPlayerId()));
  } catch {
    /* Nothing to clear is the same as cleared. */
  }
}
