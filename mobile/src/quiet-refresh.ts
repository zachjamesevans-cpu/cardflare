/**
 * When a refresh is worth it, and when it is not.
 *
 * The app re-reads things on a timer and on every return to a screen,
 * and most of those reads come back saying what the screen already
 * says. Each rule here answers one question for a caller that is about
 * to spend something: a network request, a write to disk, or a render
 * of a whole board. Pure on purpose, so tests/unit can walk them.
 */

/** A place, as the phone reports it. */
export interface Fix {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_MILES = 3958.8;

/** Straight-line miles between two fixes (haversine). */
export function milesBetween(a: Fix, b: Fix): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** How far a newer fix has to be from the one already sent to ask again. */
export const FIX_MOVED_MILES = 1;

/**
 * Whether a fresher fix is far enough from the one a request already
 * went out with to be worth asking again.
 *
 * The Feed asks with the last place the phone knew, at once, and a
 * fresh fix lands a few seconds later. Under a mile the answer is the
 * same list, so nothing is asked. No earlier fix at all means the first
 * request went out with no place, so any fresh one is worth sending;
 * no fresh fix means there is nothing new to say.
 */
export function movedEnough(
  sent: Fix | null,
  fresh: Fix | null,
  miles: number = FIX_MOVED_MILES,
): boolean {
  if (!fresh) return false;
  if (!Number.isFinite(fresh.latitude) || !Number.isFinite(fresh.longitude))
    return false;
  if (!sent) return true;
  return milesBetween(sent, fresh) > miles;
}

/**
 * Whether two answers say the same thing, all the way down.
 *
 * For what the server sends: objects, arrays, strings, numbers,
 * booleans and null. A key that is undefined counts as absent, the way
 * JSON would have dropped it, so a value that has been through disk
 * still equals the one that has not.
 */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return Number.isNaN(a) && Number.isNaN(b);
  }
  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;
  if (aIsArray) {
    const left = a as unknown[];
    const right = b as unknown[];
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!sameData(left[index], right[index])) return false;
    }
    return true;
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  for (const key of Object.keys(left)) {
    if (left[key] === undefined) continue;
    if (!sameData(left[key], right[key])) return false;
  }
  for (const key of Object.keys(right)) {
    if (right[key] !== undefined && left[key] === undefined) return false;
  }
  return true;
}

/**
 * The newer answer, built from as much of the older one as still says
 * the same thing.
 *
 * A screen that draws a list re-renders every row whose object is new,
 * and a re-read hands back all new objects even when one row changed.
 * This returns `previous` itself when nothing changed at all, so a
 * `setState` with it is no render; otherwise every element (and every
 * keyed part) that is the same as before is the old object, so a
 * memoised row sees the props it already drew.
 *
 * List elements are matched by position first and then, for objects
 * that name themselves, by `keyOf`, so a row keeps its object when a
 * new one arrives above it.
 */
export function keepSame<T>(
  previous: T,
  next: T,
  keyOf?: (element: unknown) => string | null,
): T {
  if (previous === next) return previous;
  if (
    typeof previous !== "object" ||
    typeof next !== "object" ||
    previous === null ||
    next === null
  ) {
    return sameData(previous, next) ? previous : next;
  }
  if (Array.isArray(previous) !== Array.isArray(next)) return next;

  if (Array.isArray(previous) && Array.isArray(next)) {
    let byKey: Map<string, unknown> | null = null;
    const keyed = (element: unknown): unknown => {
      if (!keyOf) return undefined;
      const key = keyOf(element);
      if (key === null) return undefined;
      if (!byKey) {
        byKey = new Map();
        for (const old of previous) {
          const oldKey = keyOf(old);
          if (oldKey !== null && !byKey.has(oldKey)) byKey.set(oldKey, old);
        }
      }
      return byKey.get(key);
    };
    let changed = previous.length !== next.length;
    const merged = next.map((element, index) => {
      const here = index < previous.length ? previous[index] : undefined;
      let kept: unknown;
      if (here !== undefined && sameData(here, element)) {
        kept = here;
      } else {
        /* Its own old object if it names itself, else whatever stood
           here: either way the result says exactly what `element` says. */
        const old = keyed(element) ?? here;
        kept = old === undefined ? element : keepSame(old, element, keyOf);
      }
      if (kept !== here) changed = true;
      return kept;
    });
    return (changed ? merged : previous) as T;
  }

  const before = previous as Record<string, unknown>;
  const after = next as Record<string, unknown>;
  let changed = false;
  const merged: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    merged[key] = key in before ? keepSame(before[key], after[key], keyOf) : after[key];
    if (merged[key] !== before[key]) changed = true;
  }
  if (!changed) {
    for (const key of Object.keys(before)) {
      if (before[key] !== undefined && !(key in after)) changed = true;
    }
  }
  return (changed ? merged : previous) as T;
}

/**
 * Whether two flat records hold the same values: every own key equal
 * by identity. For a memoised row whose object is rebuilt each render
 * out of the same strings and numbers.
 */
export function sameShallow(
  a: object | null | undefined,
  b: object | null | undefined,
) {
  if (a === b) return true;
  if (!a || !b) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  for (const key of keys) {
    if (left[key] !== right[key] || !(key in right)) return false;
  }
  return true;
}

/** How long a tab change waits before it is worth asking the same thing again. */
export const ASK_AGAIN_MS = 5_000;

/**
 * Whether the same question was asked so recently that asking again
 * would only repeat the answer. A clock that has gone backwards (the
 * phone's time was changed) never counts as recent.
 */
export function askedRecently(
  askedAt: number,
  now: number,
  windowMs: number = ASK_AGAIN_MS,
): boolean {
  if (askedAt <= 0) return false;
  const since = now - askedAt;
  return since >= 0 && since < windowMs;
}
