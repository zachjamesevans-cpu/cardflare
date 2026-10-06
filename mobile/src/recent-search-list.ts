/**
 * The recent-searches list itself, with no storage in it, so the unit
 * tests can walk it. The same rules as the website's
 * src/components/feed/recent-searches.ts: the last eight, newest
 * first, never twice (case aside), a blank search changes nothing.
 * src/recent-searches.ts keeps it on the phone.
 */

export const RECENT_LIMIT = 8;

/*
 * Under src/cache.ts's prefix on purpose: clearCache() sweeps every key
 * that starts with it on sign-out, so a phone handed to somebody else
 * never shows them what the last person searched for.
 */
const PREFIX = "cardflare.cache.v2.recent-searches";

/** The storage key for one account, or for a guest on this phone. */
export function recentKey(account: string | null): string {
  return `${PREFIX}.${account ?? "guest"}`;
}

/** The list with `query` put first: trimmed, never twice, never past the limit. */
export function withRecent(list: readonly string[], query: string): string[] {
  const entry = query.trim();
  if (!entry) return [...list];
  const folded = entry.toLowerCase();
  return [entry, ...list.filter((item) => item.toLowerCase() !== folded)].slice(
    0,
    RECENT_LIMIT,
  );
}

/** What storage held, read as a list; anything else is an empty one. */
export function parseRecent(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string" && item.trim() !== "")
      .slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}
