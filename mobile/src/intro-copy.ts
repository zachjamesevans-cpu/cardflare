/**
 * What a new player is told, once, right after signing up.
 *
 * The founder (2026-10-15): "id like a quick 30 second introduction to
 * the app when people first sign up - such as highlighting the post a
 * flare button, a quick 30 word summary or something." Five cards now,
 * about fifty-five words, then the one button that matters - the
 * founder: "if you had to summarize cardflare into the 4-5 most eye
 * catching slides and features what would you do? ... id love to
 * highlight the binder feature". What you want (Post a Flare, Find it
 * nearby), what you have (your binders, and the link that shares one),
 * then the payoff (Meet up and trade).
 *
 * Free of imports so the app carries a word-for-word twin
 * (mobile/src/intro-copy.ts): both sign-ups say exactly this.
 */

export interface IntroCard {
  key: "post" | "nearby" | "binders" | "share" | "trade";
  title: string;
  body: string;
}

export const INTRO_CARDS: readonly IntroCard[] = [
  /* Posting and the followers' answer, one moment: it was two cards. */
  {
    key: "post",
    title: "Post a Flare",
    body: "Post the cards you’re hunting. Followers like and comment.",
  },
  /* "players near you find it for you from their binders" */
  {
    key: "nearby",
    title: "Find it nearby",
    body: "Players near you check their binders and offer it to you.",
  },
  {
    key: "binders",
    title: "Your binders, your way",
    body: "Name them, pick a cover, show them off or keep them private.",
  },
  /* The founder's own line: "want someone to see your trade binder?
     send them a link". */
  {
    key: "share",
    title: "Share your binder",
    body: "Want someone to see your trade binder? Send them a link.",
  },
  {
    key: "trade",
    title: "Meet up and trade",
    body: "Message, meet at the store, mark it found.",
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
 * THE TOURS. The founder: "i think we need another similar vibe, but
 * when people click the profile for the first time", then, asked what
 * else would benefit, "build 1-3 go": a store room, your own binder, and
 * Nearby. The Feed spotlight's dim, ring and bubble, one stop at a time.
 *
 * The rules, the same for every tour: a new player only (all are queued
 * when the intro ends, so an update never shows one); each shows once,
 * on the first visit to its screen; three or four stops at most; Skip
 * always ends it; a stop with nothing to point at is passed over; and
 * Settings -> Help -> "Replay tips" queues them all again.
 */
export type TourId = "profile" | "room" | "binder" | "nearby";

export interface TourStop {
  key: string;
  line: string;
}

export const TOURS: Record<TourId, readonly TourStop[]> = {
  profile: [
    {
      key: "binders",
      line: "Your binders live here. Tap New to start one: name it, pick a cover, keep it public or private.",
    },
    {
      key: "share",
      line: "Send anyone a link to your profile. Open a binder to share just that one.",
    },
    { key: "wand", line: "Make it yours: rings, auras and more from the Embers shop." },
    { key: "tabs", line: "Your Flares, hunts and trades, all in one place." },
  ],
  /* No "open to trades" stop: a signed-in player meets that switch in
     the composer, not on the room, so it would never be there to ring. */
  room: [
    {
      key: "board",
      line: "Everyone’s Flares in this room. Tap a card you have to offer it.",
    },
    { key: "yours", line: "Your Flares went up when you joined." },
    { key: "add", line: "Post another for this room here." },
  ],
  binder: [
    { key: "pockets", line: "Tap a pocket to add a card." },
    { key: "share", line: "Send this binder’s link to anyone." },
    { key: "settings", line: "Change the cover, or make it private." },
  ],
  nearby: [
    {
      key: "wanted",
      line: "People near you who want cards you have. Message them right from here.",
    },
    { key: "location", line: "Add your ZIP to see who’s close." },
  ],
};

export const TOUR_IDS = Object.keys(TOURS) as TourId[];

/** The first tour, kept by its old name for the profile's callers. */
export const PROFILE_TOUR = TOURS.profile;

export const TOUR_NEXT = "Next";
export const TOUR_SKIP = "Skip";
export const TOUR_DONE = "Got it";
/** One line in Help for every tour, rather than one per tour. */
export const REPLAY_TIPS_LABEL = "Replay tips";

/*
 * YOUR FIRST STEPS: a checklist at the top of a new player's Feed that
 * ticks itself off. The founder, asking for things "waiting for them"
 * when they first sign up, then "build it all". Every step is one the
 * server can see done - sharing a binder is not recorded anywhere, so
 * it is not a step; where you play is. Gone when all four are done, or
 * when the account is two weeks old.
 */
export type FirstStep = "post" | "follow" | "binder" | "where";

export const FIRST_STEPS_TITLE = "Your first steps";

export const FIRST_STEPS: readonly { key: FirstStep; label: string }[] = [
  { key: "post", label: "Post your first Flare" },
  { key: "follow", label: "Follow 3 players" },
  { key: "binder", label: "Make a binder" },
  { key: "where", label: "Set where you play" },
];

/** Follows that complete the "follow" step. */
export const FIRST_STEPS_FOLLOWS = 3;

/** "2 of 4 done" */
export function firstStepsCount(done: number): string {
  return `${done} of ${FIRST_STEPS.length} done`;
}

/** "1 of 3" */
export function tourCount(at: number, total: number = PROFILE_TOUR.length): string {
  return `${at + 1} of ${total}`;
}

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

/** The post scene's answer: a like count, a comment count, and the
    first comment. */
export const INTRO_LIKES = 12;
export const INTRO_COMMENT_COUNT = 3;
export const INTRO_COMMENT = {
  name: "Maya",
  body: "Saw one at the shop on Main!",
} as const;

/*
 * The binders scene: three of a player's own, by cover and name, one
 * kept private. Real covers from the seven (BINDER_COVERS); a cover has
 * no picture on it by the founder's rule, so the art stays in the cards.
 */
export const INTRO_BINDERS = [
  { cover: "lime", name: "Trades", private: false },
  { cover: "gold", name: "Grails", private: false },
  { cover: "galaxy", name: "PC", private: true },
] as const;
export const INTRO_PUBLIC = "On your profile";
export const INTRO_PRIVATE = "Private";

/*
 * The share scene: the link to a trade binder, sent in a message, and
 * the friend who opens it wanting a card - the binder page's own words
 * (BINDER_OFFER_COPY.want), then the offer gone.
 */
export const INTRO_SHARE_MESSAGE = "Here’s my trade binder!";
export const INTRO_WANT = "I want this card";
export const INTRO_OFFER_SENT = "Offer sent";
/** A handle for the link's title before the player has one. */
export const INTRO_HANDLE_FALLBACK = "yourname";

/** The link, in the real shape: a binder's eight-letter share code
    (app/b/[binderId]), never the handle - that is not a link that
    exists. */
export const INTRO_SHARE_LINK = "cardflare.gg/b/k7q2m9xa";

/** The link card's title, as the friend sees it: whose, and which. */
export function introShareTitle(handle: string | null | undefined): string {
  const tidy = (handle ?? "").replace(/^@/, "").trim();
  return `@${tidy || INTRO_HANDLE_FALLBACK} · ${INTRO_BINDERS[0].name}`;
}

/** The third scene's two messages, about the rail's last card. */
export function introChat(card: string): readonly [string, string] {
  return [`I have ${card}. Want to trade?`, "Yes! Meet at the store Thursday?"];
}
