/**
 * The words for counts, in one place.
 *
 * "Cards" and "copies" are two different numbers and the product keeps
 * them apart everywhere: a hunt of three cards can want seven copies.
 * These are the only spellings, so a screen cannot say "2 card" or
 * fold the two into one.
 */

export const cardsLabel = (n: number): string => `${n} ${n === 1 ? "card" : "cards"}`;

export const copiesLabel = (n: number): string => `${n} ${n === 1 ? "copy" : "copies"}`;

/** "Need 2 more", or "Found" once nothing is left. */
export function needLabel(remaining: number): string {
  if (remaining <= 0) return "Found";
  return `Need ${remaining} more`;
}

/** "2 available", for a card somebody is offering up. */
export const availableLabel = (n: number): string => `${n} available`;

/** "5 copies still needed", or "All found" when nothing is. */
export function stillNeededLabel(remaining: number): string {
  if (remaining <= 0) return "All found";
  return `${copiesLabel(remaining)} still needed`;
}

/** "2 cards selected · 3 copies", the footer under a selection. */
export function selectionLabel(cards: number, copies: number): string {
  return `${cardsLabel(cards)} selected · ${copiesLabel(copies)}`;
}

/** The printing somebody asked for, or the honest default. */
export const printingLabel = (label: string | null | undefined): string =>
  label ?? "Any printing";
