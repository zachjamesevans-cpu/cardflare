/**
 * How the Feed is drawn, and who decides.
 *
 * The founder: "lets develop a few 'views' for the feed, that can be
 * changed under settings in the profile. this is the orignal view,
 * let's make a compact view. maybe a carousel of just the card art and
 * a green quantity count of the card they're needing on the card...
 * focus on making things contexual - only popping up when needed. one
 * flare takes up the whole screen right now pretty much."
 *
 * THE APP'S COPY of src/lib/feed/views.ts - same names, same order,
 * same fallback. tests/unit/feed-views.test.ts fails if the two drift,
 * because a view the website offers and the app cannot draw is a
 * setting that does nothing.
 */

/** The views this build knows, in the order they are offered. */
export const FEED_VIEWS = ["classic", "compact"] as const;

export type FeedView = (typeof FEED_VIEWS)[number];

export const FEED_VIEW_TITLES: Record<FeedView, string> = {
  classic: "Classic",
  compact: "Compact",
};

/**
 * What each one is, in the words the settings screen uses. Said once so
 * the website and the app cannot describe the same choice differently.
 */
export const FEED_VIEW_BLURBS: Record<FeedView, string> = {
  classic: "The full post: every card with its name, number and progress.",
  compact: "Card art and what is still needed. Everything else on tap.",
};

/**
 * The view to draw, from whatever the server said.
 *
 * ANYTHING UNRECOGNISED IS CLASSIC. The app ships on TestFlight's clock
 * and the server on Vercel's, so a phone will meet a view added after
 * it was built. Falling back to the original is the one answer that is
 * always drawable; guessing would be a blank Feed.
 */
export function feedViewFrom(value: string | null | undefined): FeedView {
  return FEED_VIEWS.includes(value as FeedView) ? (value as FeedView) : "classic";
}
