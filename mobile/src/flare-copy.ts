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

/**
 * What a message about a post is about, for "About your <this>: ".
 *
 * The card's name for a one-card post. For several it names the post,
 * not whichever card happens to lead the rail: a message about a
 * twenty-card hunt that opened "About your Nami:" read as a question
 * about one card. The website's `postSubject` (src/lib/feed/card-copy.ts)
 * says the same.
 */
export function postSubject(post: {
  total: number;
  cards: readonly { cardName: string }[];
  hunt?: { name: string } | null;
  deckLabel?: string | null;
}): string {
  const lead = post.cards[0]?.cardName;
  if (post.total <= 1 && lead) return lead;
  const named = post.hunt?.name?.trim() || post.deckLabel?.trim();
  if (named) return `${named} Flare`;
  return `Flare of ${cardsLabel(Math.max(post.total, post.cards.length))}`;
}
