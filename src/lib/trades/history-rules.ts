/**
 * The two rules the trade history is built on, kept pure so they can
 * be tested without a database.
 */

/**
 * Which way the card went, for the viewer.
 *
 * On a want the requester posted "I need this" and the holder brought
 * it: the requester GOT the card. On a showcase the requester was
 * letting it go, so the same seat GAVE it. Both sides of the table
 * read from the same rule.
 */
export function cardCameToYou(youWereRequester: boolean, showcase: boolean): boolean {
  return youWereRequester !== showcase;
}

/**
 * The trade an Ember ledger ref points at, for both the award
 * ("trade:<id>:<player>") and its reversal ("reversal:trade:<id>:<player>"),
 * or null for a ref about something else.
 */
export function tradeIdFromRef(ref: string): string | null {
  const parts = ref.replace(/^reversal:/, "").split(":");
  return parts[0] === "trade" && parts[1] ? parts[1] : null;
}
