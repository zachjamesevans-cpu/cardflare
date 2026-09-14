/**
 * Nearby matching's words, free of server-only imports so both the
 * website's client islands and the unit tests can use them.
 */

/**
 * How far away, said coarsely on purpose.
 *
 * A distance is ZIP centroid to ZIP centroid, which is already miles
 * of slack, and it is rounded again here so a number can never be
 * walked back to a street. Under two miles is "nearby" and nothing
 * finer: the founder's rule is approximate location, preserved.
 */
export function milesLabel(miles: number): string {
  if (miles < 2) return "Under 2 mi away";
  return `About ${Math.round(miles)} mi away`;
}

/** The first message "I have this" sends, with or without a place to suggest. */
export function haveThisMessage(storeName: string | null): string {
  return storeName
    ? `I have this one. Want to meet at ${storeName}?`
    : "I have this one. Where do you usually play?";
}

/** The first message "Message <name>" sends: a hello, so the box opens on a thread that exists. */
export function messageOpener(): string {
  return "Hi! I saw you are looking for this.";
}
