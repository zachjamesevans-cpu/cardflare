/**
 * Offers on a trade binder's cards, in the website's words.
 *
 * Mirrors `src/lib/binder/offer-copy.ts` word for word, by hand,
 * because the app cannot import across the workspace boundary. The
 * failure sentences are the ones `offerOnBinderAction` in
 * `src/lib/binder/actions.ts` says. `tests/unit/binder-share-app.test.ts`
 * reads both and fails if they drift.
 *
 * The founder: "Any card in a trade binder you should be able to do the
 * same stack as making an offer on their trade cards - like scrolling
 * through them with the same UI as making an offer on someone's flares.
 * Can then DM them about them." So the viewer is the Flare viewer's
 * (pick, review, send), and what it sends is a message in the pair's
 * one conversation, carrying the cards.
 *
 * Nothing here imports anything, so a unit test can read it.
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

/**
 * Why an offer on a binder was refused, said to the person who tapped:
 * the server's reason (POST /api/v1/binders/<id>/offer answers
 * `{ ok: false, reason }`), plus "unauthorized" for a 401 and
 * "invalid" for a 400, which the website's action says before it ever
 * asks the server.
 */
export function binderOfferFailure(reason: string): string {
  switch (reason) {
    case "unauthorized":
      return "Sign in to make an offer.";
    case "invalid":
      return "Pick a card first.";
    case "yours":
      return "That's your own binder.";
    case "blocked":
      return "You can't message this player.";
    case "not-found":
      return "This binder isn't up for trade any more.";
    case "empty":
      return "Those cards aren't in the binder any more.";
    default:
      return "Could not send that. Try again in a moment.";
  }
}
