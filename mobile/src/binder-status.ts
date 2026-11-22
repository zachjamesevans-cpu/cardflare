/**
 * The words the binder page wears instead of a paragraph: the status
 * pill, the "wanted nearby" line and the one-time move tip. The website's
 * src/lib/binder/binder-status.ts says exactly the same.
 *
 * The founder, on the sentences that sat above and below the pockets:
 * "i dont like how there's just this small text above and below that
 * isnt contextual. it's just always present." So the switch is a pill
 * (tap it, the settings sheet says what it means), the line under it
 * appears only when it has news, and the tip shows until the owner has
 * moved a card once.
 */

/** The binder's switch, as a pill: lime when up for trade. */
export function binderStatusLabel(forTrade: boolean, isPublic: boolean): string {
  if (forTrade) return "Up for trade";
  return isPublic ? "On profile" : "Private";
}

/** "3 of these are wanted nearby": only drawn when it is more than none. */
export function wantedNearbyLine(cards: number): string {
  return `${cards} of these ${cards === 1 ? "is" : "are"} wanted nearby`;
}

/** The strip on a pocket somebody nearby wants: ON YOUR HUNT's shape. */
export const WANTED_STRIP = "WANTED NEARBY";

/** The move tip, until the owner has held a card once. */
export const MOVE_HINT = "Hold a card to move it, or drop it on Remove.";

/** Where "the owner has moved a card" is remembered, on this device. */
export const MOVE_HINT_KEY = "cardflare.binderMoveHintDone";
