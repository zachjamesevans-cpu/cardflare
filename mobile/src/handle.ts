/**
 * A handle: the name a player is FOUND by.
 *
 * The app's copy of `src/lib/players/handle.ts`. The two are kept in
 * step by `tests/unit/handle.test.ts`, which reads both files and walks
 * the same cases through each — the app is a separate package with no
 * test runner, so the website's suite is where the agreement is checked.
 *
 * Deriving here rather than only on the server so the field can be typed
 * straight into shape: a capital or a space becomes what the server
 * would have made of it anyway, and the phone never shows something
 * about to be refused.
 */

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;

export function handleFrom(candidate: string): string {
  return candidate
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, HANDLE_MAX)
    .replace(/_+$/g, "");
}

/** Deliberately boring: a handle that obviously wants changing. */
export const HANDLE_FALLBACK = "player";

/** A derived handle, or the fallback when the name left nothing behind. */
export function handleSeedFrom(displayName: string): string {
  const derived = handleFrom(displayName);
  return derived.length >= HANDLE_MIN ? derived : HANDLE_FALLBACK;
}

/** How a handle is written wherever a person reads one. */
export function formatHandle(handle: string): string {
  return `@${handle}`;
}
