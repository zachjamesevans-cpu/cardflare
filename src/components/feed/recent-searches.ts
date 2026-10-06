/**
 * Recent searches, kept on this device.
 *
 * The last eight things somebody searched for, newest first, shown in
 * the search before anything is typed so the second search for the
 * same friend is one tap. Stored in the browser, one list per account,
 * so two people sharing a laptop never see each other's. The app keeps
 * the same list on the phone.
 *
 * Every read and write is in a try/catch: a private window, blocked
 * site data or a full quota throws, and a search that cannot remember
 * must still search. An unreadable list is an empty one.
 */

export const RECENT_LIMIT = 8;

const PREFIX = "cardflare:recent-searches";

/** The storage key for one account, or for a guest on this device. */
export function recentKey(account: string | null): string {
  return `${PREFIX}:${account ?? "guest"}`;
}

/**
 * The list with `query` put first: trimmed, never twice (case aside),
 * and never longer than RECENT_LIMIT. A blank query changes nothing.
 */
export function withRecent(list: readonly string[], query: string): string[] {
  const entry = query.trim();
  if (!entry) return [...list];
  const folded = entry.toLowerCase();
  return [entry, ...list.filter((item) => item.toLowerCase() !== folded)].slice(
    0,
    RECENT_LIMIT,
  );
}

export function readRecent(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string" && item.trim() !== "")
      .slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

export function writeRecent(key: string, list: readonly string[]): void {
  try {
    if (list.length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(list.slice(0, RECENT_LIMIT)));
  } catch {
    /* Remembering is a convenience; the search already happened. */
  }
}
