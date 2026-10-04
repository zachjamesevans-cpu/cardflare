/**
 * The words on a hunt's row and under its name.
 *
 * A hunt is drawn like a binder now: a cover on the Hunts tab, pockets
 * when it is open. The line under the name says how many cards it
 * wants and how many are still out. Cards, not copies: the row is the
 * glance, and the progress bar on the page carries the copies.
 *
 * A plain module, free of React and of server-only imports, so the
 * page, the panel and the unit tests all read the same line, and the
 * app's hunt-copy.ts mirrors it word for word.
 */

/** "No cards yet", "3 cards · 2 left", "1 card · All found". The dot is U+00B7. */
export function huntRowLine(cards: number, left: number): string {
  if (cards === 0) return "No cards yet";
  return `${cards} ${cards === 1 ? "card" : "cards"} · ${left === 0 ? "All found" : `${left} left`}`;
}
