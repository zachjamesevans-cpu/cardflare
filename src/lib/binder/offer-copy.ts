import { MESSAGE_MAX_LENGTH } from "@/lib/local/shared";

/**
 * Offers on a trade binder's cards, the parts any file may import: the
 * words on the viewer and the message the offer becomes.
 *
 * The founder: "Any card in a trade binder you should be able to do the
 * same stack as making an offer on their trade cards - like scrolling
 * through them with the same UI as making an offer on someone's flares.
 * Can then DM them about them." So the viewer is the Flare viewer's
 * (pick, review, send), and what it sends is a message in the pair's
 * one conversation, carrying the cards. Mirrored for the app in
 * `mobile/src/binder-offer-copy.ts`.
 */

/** Cards one offer may carry. */
export const BINDER_OFFER_MAX_CARDS = 20;
/** The note's own limit, leaving room for the list above it. */
export const BINDER_OFFER_NOTE_MAX = 280;

export const BINDER_OFFER_COPY = {
  /** The toggle on a card nobody has picked. */
  want: "I want this card",
  /** The same toggle once picked. */
  picked: "Added to your offer",
  /** Where a signed-out visitor is sent instead of the toggle. */
  signIn: "Sign in to make an offer",
  /** The send button in the review. */
  send: "Send offer",
  /** The review's placeholder for the note. */
  notePlaceholder: "Add a note: what you could trade, when you're at the store",
} as const;

/** "Sent to Mia. It's in your messages." */
export function binderOfferSentLine(ownerName: string): string {
  return `Sent to ${ownerName}. It's in your messages.`;
}

function line(card: { name: string; quantity: number }): string {
  return card.quantity > 1 ? `${card.name} ×${card.quantity}` : card.name;
}

/**
 * The message an offer becomes: the binder named, the cards listed, and
 * the note on its own line. Never longer than a message may be: the
 * list gives way to "and N more" before anything is cut mid-word.
 */
export function binderOfferBody(
  binderName: string,
  cards: { name: string; quantity: number }[],
  note: string | null,
): string {
  const trimmedNote = note?.trim().slice(0, BINDER_OFFER_NOTE_MAX) || null;
  const head = `Offer on your ${binderName}: `;
  const tail = trimmedNote ? `\n\n${trimmedNote}` : "";

  for (let shown = cards.length; shown >= 1; shown -= 1) {
    const rest = cards.length - shown;
    const list = cards.slice(0, shown).map(line).join(", ");
    const more = rest > 0 ? `, and ${rest} more` : "";
    const body = `${head}${list}${more}.${tail}`;
    if (body.length <= MESSAGE_MAX_LENGTH) return body;
  }
  return `${head}${cards.length} cards.${tail}`.slice(0, MESSAGE_MAX_LENGTH);
}
