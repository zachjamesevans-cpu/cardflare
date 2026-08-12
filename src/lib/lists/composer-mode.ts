/**
 * Which Flare composer the app is running.
 *
 * Two are kept alive on purpose, at the founder's request, because the
 * better one is a question about thumbs at a counter and cannot be
 * settled from a desk:
 *
 * - `inline` puts a compact composer inside the search result you
 *   tapped, so the controls arrive where your finger already is and the
 *   post happens without it travelling.
 * - `confirm` is the previous two-step flow: pick a card, the results
 *   collapse, and a short form takes their place.
 *
 * A build-time switch rather than a runtime setting. Nobody is choosing
 * this per player; it is one decision for the whole app, and reading it
 * from the environment means going back is redeploying with the
 * variable flipped rather than reverting code.
 *
 * Set NEXT_PUBLIC_FLARE_COMPOSER to "confirm" to go back. Anything else,
 * including unset, is the inline composer.
 */
export type ComposerMode = "inline" | "confirm";

export function composerMode(): ComposerMode {
  return process.env.NEXT_PUBLIC_FLARE_COMPOSER === "confirm" ? "confirm" : "inline";
}
