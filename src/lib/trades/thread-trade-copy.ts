import type { ThreadTradeFailure } from "./thread-trades";

/** The limit the forms and the server share. Here, not in the lib, so a
    client bundle can read it without dragging the server in. */
export const THREAD_TRADE_QUANTITY_MAX = 99;

/**
 * What a refused "We traded" says, in words for the person. Free of
 * server-only imports (a type import carries nothing), so the website's
 * action and the unit tests both read the same sentences.
 */
export function tradeFailureMessage(reason: ThreadTradeFailure): string {
  switch (reason) {
    case "closed":
      return "This conversation was ended.";
    case "pending":
      return "One trade at a time. Wait for their answer first.";
    case "already-traded":
      return "That Flare already traded.";
    case "no-card":
      return "Pick a card from the list.";
    case "answered":
      return "That one was already answered.";
    case "not-found":
      return "That trade is not here any more.";
    default:
      return "Something went wrong. Please try again in a moment.";
  }
}
