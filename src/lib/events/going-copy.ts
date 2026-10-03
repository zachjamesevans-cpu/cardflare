/**
 * The words around Going, shared by every surface that draws the button.
 *
 * Plain on purpose: no server-only import, so client components and the
 * parity test can read it. `mobile/src/going-copy.ts` is the app's copy,
 * word for word, and tests/unit/nights-parity.test.ts holds the two
 * together.
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
