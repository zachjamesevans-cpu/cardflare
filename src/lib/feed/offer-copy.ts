/**
 * What an offer says, in words shared by the website, its actions and
 * the unit tests. Free of server-only imports on purpose; the app
 * mirrors these sentences by hand in `mobile/src/offer-copy.ts`.
 */

export type OfferFailure =
  "not-found" | "own-flare" | "at-cap" | "unavailable" | "nothing-left" | "too-many";

/** Why an offer was refused, said to the person who tapped. */
export function offerFailureMessage(reason: OfferFailure | string): string {
  switch (reason) {
    case "not-found":
    case "nothing-left":
      return "That card is not up any more.";
    case "own-flare":
      return "That one is yours.";
    case "at-cap":
      return "You have offers on the most cards this room allows.";
    case "too-many":
      return "That is a lot of offers. Give it a minute.";
    default:
      return "Could not send the offer. Try again.";
  }
}

/** "Ace, Luffy ×2 and Sabo" */
export function listOf(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The thread's own line for an offer, when the person wrote no note. */
export function offeredLine(cards: { name: string; quantity: number }[]): string {
  const names = cards.map((card) =>
    card.quantity > 1 ? `${card.name} ×${card.quantity}` : card.name,
  );
  return `Offered ${listOf(names)}.`;
}

/** The button, by how many cards are picked. */
export function offerButtonLabel(count: number): string {
  return count <= 1 ? "Offer this card" : `Offer ${count} cards`;
}
