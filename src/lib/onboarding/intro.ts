/**
 * What a new player is told, once, right after signing up.
 *
 * The founder (2026-10-15): "id like a quick 30 second introduction to
 * the app when people first sign up - such as highlighting the post a
 * flare button, a quick 30 word summary or something." Three cards,
 * about twenty-five words in all, then the one button that matters.
 *
 * Free of imports so the app carries a word-for-word twin
 * (mobile/src/intro-copy.ts): both sign-ups say exactly this.
 */

export interface IntroCard {
  key: "post" | "nearby" | "trade";
  title: string;
  body: string;
}

export const INTRO_CARDS: readonly IntroCard[] = [
  { key: "post", title: "Post a Flare", body: "For the cards you’re hunting." },
  { key: "nearby", title: "Players near you", body: "Who have them raise a hand." },
  {
    key: "trade",
    title: "Message, meet up, trade",
    body: "Mark it found when it’s yours.",
  },
];

export const INTRO_NEXT = "Next";
export const INTRO_SKIP = "Skip";
/** The last card's button: straight into the composer. */
export const INTRO_POST = "Post your first Flare";
/** The quieter way out: the Feed, with the + pointed at. */
export const INTRO_LOOK = "Look around first";

/** The one line beside the highlighted + on a first visit to the Feed. */
export const SPOTLIGHT_LINE = "Tap here to post a Flare: the cards you’re hunting.";
export const SPOTLIGHT_DISMISS = "Got it";

/*
 * The question after games, optional. Nearby needs a place to measure
 * from, and the intro's second card promises "players near you", so it
 * is asked here rather than discovered later. The founder said yes to
 * adding it (2026-10-15).
 */
export const WHERE_TITLE = "Where do you play?";
export const WHERE_BODY =
  "Your ZIP code finds players and stores near you. Just the five digits, never an address.";
export const WHERE_SKIP = "Skip for now";

/** In Settings, under Help. */
export const REPLAY_LABEL = "Replay the intro";
