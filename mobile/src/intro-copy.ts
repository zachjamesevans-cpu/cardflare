/**
 * What a new player is told, once, right after signing up.
 *
 * The founder (2026-10-15): "id like a quick 30 second introduction to
 * the app when people first sign up - such as highlighting the post a
 * flare button, a quick 30 word summary or something." Four cards since
 * the founder asked for the social one, about forty-five words in all,
 * then the one button that matters.
 *
 * Free of imports so the app carries a word-for-word twin
 * (mobile/src/intro-copy.ts): both sign-ups say exactly this.
 */

export interface IntroCard {
  key: "post" | "social" | "nearby" | "trade";
  title: string;
  body: string;
}

export const INTRO_CARDS: readonly IntroCard[] = [
  { key: "post", title: "Post a Flare", body: "For the cards you’re hunting." },
  /*
   * What happens once it is up, in two cards. The founder: "i like the
   * idea of the social features - honestly maybe a forth slide ... that
   * showcases someone commenting on a flare post. think it's important
   * to showcase that a flare gets posted - your followers can comment,
   * players nearby can offer it to you if they have it". And on the
   * nearby card, after "Who have them raise a hand" read oddly:
   * "players near you find it for you from their binders".
   */
  {
    key: "social",
    title: "Your followers chime in",
    body: "They see your Flare, like it and comment.",
  },
  {
    key: "nearby",
    title: "Find it nearby",
    body: "Players near you find it in their binders and offer it to you.",
  },
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

/*
 * THE SCENES. Each card shows a small scene of the app instead of an
 * icon - the founder: "the big screen that shows all the big icons ...
 * isn't enough. maybe a screenshot of the app or something for each".
 * Drawn from the app's own pieces, with art from the games the player
 * just picked: three cards per game, bundled (public/intro and
 * mobile/assets/intro), so the intro needs no network on first launch.
 */
export type IntroGame = "one-piece" | "pokemon" | "lorcana" | "mtg" | "flesh-and-blood";

/** The three cards per game, in rail order: names for the scenes' words. */
export const INTRO_ART: Record<IntroGame, readonly [string, string, string]> = {
  "one-piece": ["Luffy", "Zoro", "Nami"],
  pokemon: ["Pikachu", "Charizard", "Umbreon"],
  lorcana: ["Mickey Mouse", "Elsa", "Stitch"],
  mtg: ["Lightning Bolt", "Llanowar Elves", "Counterspell"],
  "flesh-and-blood": ["Dorinthea", "Bravo", "Katsu"],
};

/** The game whose art the scenes use: the first picked that has some. */
export function introGame(picked: readonly string[]): IntroGame {
  for (const slug of picked) {
    if (slug in INTRO_ART) return slug as IntroGame;
  }
  /* One Piece is cardflare's home game, and Riftbound has no catalogue
     art yet, so a Riftbound player sees it too. */
  return "one-piece";
}

/** Made-up players for the second scene, nearest first. */
export const INTRO_PEOPLE = [
  { name: "Zoe", miles: "1.2 mi" },
  { name: "Kaito", miles: "2.4 mi" },
  { name: "Maya", miles: "3.1 mi" },
] as const;

/** The first scene's poster, and the nearby scene's answer: the app's
    own word for a card somebody has put forward ("OFFERED"). */
export const INTRO_YOU = "You";
export const INTRO_OFFERED = "Offered";

/** The social scene: a like count, and two followers' comments. */
export const INTRO_LIKES = 12;
export const INTRO_COMMENTS = [
  { name: "Maya", body: "Saw one at the shop on Main!" },
  { name: "Kaito", body: "I’ll check my binder tonight." },
] as const;

/** The third scene's two messages, about the rail's last card. */
export function introChat(card: string): readonly [string, string] {
  return [`I have ${card}. Want to trade?`, "Yes! Meet at the store Thursday?"];
}
