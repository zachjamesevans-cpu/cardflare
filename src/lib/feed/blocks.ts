/**
 * Taking a blocked player out of a Feed, free of server imports so a
 * unit test can hold it to the rule: nothing of theirs is drawn, and
 * nothing of yours reaches them.
 *
 * Every item kind names its people differently: a post has a
 * `playerId`, "Wanted from you" has `entries`, a nearby match has
 * `matches`, a suggestion has `players`. Rather than teach the filter
 * each shape, it walks the item for any `playerId` field and drops the
 * item when the only people on it are blocked, or trims the list when
 * some are.
 */

type Loose = Record<string, unknown>;

function isLoose(value: unknown): value is Loose {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when the object itself names a blocked player. */
function namesBlocked(value: Loose, blocked: Set<string>): boolean {
  const id = value.playerId;
  return typeof id === "string" && blocked.has(id);
}

/**
 * An item with the blocked people removed, or null when nothing of it
 * is left to show. Arrays of people are trimmed; the item itself goes
 * when its own author is blocked.
 */
export function withoutBlocked<T extends object>(
  item: T,
  blocked: Set<string>,
): T | null {
  if (blocked.size === 0) return item;
  const loose = item as unknown as Loose;
  if (namesBlocked(loose, blocked)) return null;

  let changed = false;
  const next: Loose = { ...loose };
  for (const [key, value] of Object.entries(loose)) {
    if (!Array.isArray(value) || value.length === 0) continue;
    if (!value.every(isLoose)) continue;
    const kept = value.filter((entry) => !namesBlocked(entry, blocked));
    if (kept.length === value.length) continue;
    changed = true;
    if (kept.length === 0) return null;
    next[key] = kept;
    /* A count that described the list follows it down. */
    if (key === "entries" && typeof loose.total === "number") {
      next.total = Math.max(kept.length, loose.total - (value.length - kept.length));
    }
  }
  return changed ? (next as unknown as T) : item;
}

export function dropBlockedItems<T extends object>(
  items: T[],
  blocked: Set<string>,
): T[] {
  if (blocked.size === 0) return items;
  const out: T[] = [];
  for (const item of items) {
    const kept = withoutBlocked(item, blocked);
    if (kept) out.push(kept);
  }
  return out;
}
