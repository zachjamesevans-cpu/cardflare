/**
 * The words for counts, in one place.
 *
 * "Cards" and "copies" are two different numbers and the product keeps
 * them apart everywhere: a hunt of three cards can want seven copies.
 * These are the only spellings, so a screen cannot say "2 card" or
 * fold the two into one. What a want still needs ("Wants 2", "Need 1
 * more", "Found") and what a selection adds up to ("2 cards · 3
 * copies") are the website's words, in `offer-copy.ts`.
 */

export const cardsLabel = (n: number): string => `${n} ${n === 1 ? "card" : "cards"}`;

export const copiesLabel = (n: number): string => `${n} ${n === 1 ? "copy" : "copies"}`;

/** "2 available", for a card somebody is offering up. */
export const availableLabel = (n: number): string => `${n} available`;

/** An offered card with nothing left to give. */
export const GONE_LABEL = "Gone";

/** The printing somebody asked for, or the honest default. */
export const printingLabel = (label: string | null | undefined): string =>
  label ?? "Any printing";
