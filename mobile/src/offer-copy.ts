/**
 * What an offer says, in the website's words.
 *
 * A copy of `src/lib/feed/offer-copy.ts`, by hand, because the app
 * cannot import across the workspace boundary. The website's
 * `tests/unit/round12-parity.test.ts` and `round16-parity.test.ts`
 * read both and fail if the sentences drift.
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

/** "Review offer · 1 card" / "Review offer · 3 cards". The dot is U+00B7. */
export function reviewLabel(count: number): string {
  return `Review offer · ${count} ${count === 1 ? "card" : "cards"}`;
}

/**
 * "1 in your offer" / "3 in your offer": under a post while the viewer
 * is closed, so the picks it holds are never out of sight. "Review"
 * sits beside it.
 */
export function inYourOfferLine(count: number): string {
  return `${count} in your offer`;
}

/** "See all 4 cards", on the carousel's dots row. */
export function seeAllLabel(count: number): string {
  return `See all ${count} ${count === 1 ? "card" : "cards"}`;
}

/**
 * "2 cards · 3 copies" ("1 card · 1 copy"). Cards and copies stay two
 * numbers, and nothing else: "selected" wrapped the line at phone
 * width.
 */
export function selectionSummary(cards: number, copies: number): string {
  return `${cards} ${cards === 1 ? "card" : "cards"} · ${copies} ${
    copies === 1 ? "copy" : "copies"
  }`;
}

/**
 * The one line under a wanted card: "Wants 2" until something is
 * found, "Need 1 more" once the owner has marked progress, "Found"
 * when nothing is left. The founder: "Need 2 more" reads wrong before
 * anything is found.
 */
export function wantsLine(quantity: number, remaining: number): string {
  if (remaining <= 0) return "Found";
  if (remaining === quantity) return `Wants ${quantity}`;
  return `Need ${remaining} more`;
}
