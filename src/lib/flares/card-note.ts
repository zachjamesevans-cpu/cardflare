/**
 * A note on one card of a Flare: why this card, in the poster's words.
 *
 * The founder (2026-10-12): "let's say there's 10 people looking for a
 * card you have ... how do you choose who to message? it should have
 * their note under it ... someone could have a note that says 'for PC'
 * under a shanks card, whereas someone could have that same card up as
 * a flare but say they're building a deck, which could then open up
 * more convos." Shown under the card when it is opened and on Wanted
 * near you; on the Feed only as a small mark, so it costs no space.
 *
 * Free of imports so the app carries a word-for-word twin
 * (mobile/src/card-note.ts).
 */

/** Short on purpose: a reason, read in a list of ten people. */
export const CARD_NOTE_MAX = 80;

/** One tap rather than typing, so most people say something. */
export const CARD_NOTE_SUGGESTIONS = [
  "For my PC",
  "Building a deck",
  "Trading up",
  "Need it this week",
] as const;

export const CARD_NOTE_LABEL = "Note";
export const CARD_NOTE_PLACEHOLDER = "Why this card? (optional)";

/** One line, trimmed and cut to the limit; empty is no note. */
export function tidyCardNote(raw: string | null | undefined): string | null {
  const tidy = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, CARD_NOTE_MAX);
  return tidy || null;
}
