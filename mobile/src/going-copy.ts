/**
 * The words around Going, the app's copy of the website's
 * src/lib/events/going-copy.ts, word for word, and
 * tests/unit/nights-parity.test.ts holds the two together.
 *
 * The founder (2026-10-03): "What if, you just say you're going to an
 * event. Or a tournament night. That room stays 'open' and anyone can
 * go into there and see who is looking for which cards before the
 * tournament or event starts."
 */

export const GOING = "Going";
export const YOURE_GOING = "You're going";
export const PRE_START_PITCH =
  "See who's going and what they're hunting. Say you're going and your Flares and trade binders join the board.";
export const YOURE_ON_THE_BOARD = "You're going. Your Flares are on the board.";
export const NO_NIGHTS =
  "No nights near you yet. Follow a store to see its nights here.";
export const SCAN_OR_CODE = "Scan or enter a code";

/** "Nobody going yet", "1 going", "12 going". */
export function goingLine(n: number): string {
  if (n <= 0) return "Nobody going yet";
  return `${n} going`;
}
