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

/** A card number on its own: "OP14-009", "EB02-028". */
const CARD_NUMBER = /^[a-z]{1,4}\d{2,}-\d+[a-z]*$/i;

/**
 * The printing somebody asked for, or the honest default.
 *
 * Tidied on the way out, because the label is stored: rows written
 * before the website's `printingVariantMark` learned to drop "- OP14-009"
 * still carry it, and the Feed read "OP14-009 · OP14-EB04 · SR · -
 * OP14-0…" (the number is already printed in front of the label). So
 * each part loses lone dashes and card numbers, and a part said twice
 * is said once.
 */
export function printingLabel(label: string | null | undefined): string {
  if (!label) return "Any printing";
  const parts = label
    .split("·")
    .map((part) =>
      part
        .split(/\s+/)
        .filter((word) => word.length > 0 && !/^[-–—:]+$/.test(word))
        .filter((word) => !CARD_NUMBER.test(word))
        .join(" "),
    )
    .filter((part, index, all) => part.length > 0 && all.indexOf(part) === index);
  return parts.length > 0 ? parts.join(" · ") : "Any printing";
}

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
