/**
 * What Local offers, exactly as the website spells it.
 *
 * A byte-for-byte copy of src/lib/local/shared.ts, minus the server's
 * type guards — the app cannot import across the workspace boundary, so
 * tests/unit/app-local-shared.test.ts holds the two files together the
 * way worn-words is held.
 */

/** The distances Local offers. The database check repeats this list. */
export const LOCAL_RADII = [10, 25, 50, 100] as const;

export type LocalRadius = (typeof LOCAL_RADII)[number];

export const DEFAULT_LOCAL_RADIUS: LocalRadius = 50;

/**
 * A distance as a player reads it. Under a mile is "nearby" — "0.4 mi"
 * promises a precision the ZIP centroid behind it does not have.
 */
export function milesLabel(miles: number): string {
  if (miles < 1) return "nearby";
  return `${Math.round(miles)} mi`;
}

/** The longest message a thread accepts. The database check repeats it. */
export const MESSAGE_MAX_LENGTH = 500;

/**
 * When something happened, as a person says it. Coarse steps on
 * purpose: "3d" reads at a glance and never needs a re-render to stay
 * true the way "59 seconds ago" does.
 */
export function agoLabel(iso: string, now: number = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}
