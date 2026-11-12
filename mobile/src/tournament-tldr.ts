/**
 * A first tournament, in a few sentences - the app's copy of the guide.
 *
 * MIRRORS src/lib/event-hub/game-profiles.ts, which stays the source of
 * truth: the website renders NIGHT_BASICS and each game's beginnerTldr
 * from there, and this file repeats them because the app cannot import
 * across the package boundary. tests/unit/tournament-tldr-drift.test.ts
 * reads both and fails when they disagree, so the two platforms cannot
 * quietly teach different rules.
 */

export const NIGHT_BASICS: readonly string[] = [
  "Turn up, tell the counter you are playing, and pay the entry if there is one. That is the whole sign-up.",
  "Everyone plays every round - it is not a knockout. You get paired against someone new each round.",
  "A round has a clock, and the big screen counts it down. When it hits zero you finish the turn you are in; the screen shows exactly what happens next.",
  "Between rounds you are free: trade, buy singles, post a card you are looking for to the room board.",
  "Nobody expects you to know everything. Tell your opponent it is your first event - it goes well.",
];

export interface GameTldr {
  id: string;
  name: string;
  lines: readonly string[];
}

export const GAME_TLDRS: readonly GameTldr[] = [
  {
    id: "one-piece",
    name: "One Piece Card Game",
    lines: [
      "Bring a 50-card deck plus your Leader and 10 DON!! cards. Sleeves are worth it.",
      "Matches are usually one game, about 35 minutes on the clock.",
      "When time is called you finish the current turn plus three more. The screen walks everyone through it.",
      "Casual store events expect nothing from you except your deck. Judges and opponents help new players constantly.",
    ],
  },
  {
    id: "pokemon",
    name: "Pokémon TCG",
    lines: [
      "Bring a 60-card deck. Write a deck list if the event asks; staff will help you with it.",
      "Most locals are best-of-one, around 30 minutes, or best-of-three at 50.",
      "When time is called you play a set number of extra turns, then the game state decides.",
      "League nights are built for beginners. Losing rounds is normal and nobody tracks it.",
    ],
  },
  {
    id: "lorcana",
    name: "Disney Lorcana TCG",
    lines: [
      "Bring a 60-card deck of up to two ink colours.",
      "Matches are usually best-of-one at 30 minutes, or best-of-three at 50. First to 20 lore wins.",
      "When time is called you finish the turn plus extra turns, and lore decides if nobody got to 20.",
      "Lorcana locals skew friendly and new-player heavy. Ask your opponent anything mid-game.",
    ],
  },
  {
    id: "riftbound",
    name: "Riftbound",
    lines: [
      "Bring your main deck, your Legend, and your battlefield cards. The shop can check it's legal.",
      "Matches at locals are typically best-of-one, about 40 minutes.",
      "When time is called you finish the current turn plus extra turns; the procedure on the screen decides from there.",
      "The game is new for everyone, so tables explain rules to each other all night.",
    ],
  },
  {
    id: "flesh-and-blood",
    name: "Flesh and Blood",
    lines: [
      "Bring a 60-card deck plus your hero, weapons and equipment - 80 cards total in Classic Constructed.",
      "Matches are usually one game at 50 minutes. Life totals decide a lot, so track them carefully.",
      "When time is called you finish the current turn plus extra turns, and remaining life decides a draw.",
      "Armory nights exist specifically for learning. Say you are new and the whole table adjusts.",
    ],
  },
  {
    id: "mtg",
    name: "Magic: The Gathering",
    lines: [
      "Bring a 60-card deck for Constructed, or nothing at all for a draft: you build from packs at the table.",
      "Matches are best-of-three at 50 minutes. Sideboarding between games is normal and nobody minds if you skip it.",
      "When time is called you finish the current turn plus five more, and an unfinished game is a draw.",
      "Friday Night Magic is the beginner event. Say it is your first one and your opponent will walk you through it.",
    ],
  },
  {
    id: "yugioh",
    name: "Yu-Gi-Oh! TCG",
    lines: [
      "Bring a Main Deck of 40 to 60 cards and a Side Deck of up to 15, no more than 3 copies of a card. Sleeves are worth it.",
      "Matches are best-of-three duels on a 50-minute clock.",
      "When time is called the match simply ends, and an unfinished match is a loss for both players, so keep a steady pace.",
      "Locals expect nothing from you except your deck. Tell your opponent it is your first event.",
    ],
  },
  {
    id: "gundam",
    name: "Gundam Card Game",
    lines: [
      "Bring a 50-card deck and a 10-card Resource Deck, plus any tokens your deck makes.",
      "Store tournaments are usually one game on a 30-minute clock.",
      "When time is called you finish the turn plus 2 or 3 more, then Shields and deck size decide.",
      "Store events are the place to learn. Ask your opponent anything mid-game.",
    ],
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk TCG",
    lines: [
      "Bring a 40 to 50 card deck, exactly 3 Legends and your Gig dice. A sealed event hands you the cards.",
      "Locals are best-of-three at 50 minutes, or best-of-one at 30.",
      "When time is called you finish the turn, each player takes one more, and 7 Gig dice wins.",
      "Night City Gauntlet events are casual by design: judges there are told to teach, not punish.",
    ],
  },
  {
    id: "sorcery",
    name: "Sorcery: Contested Realm",
    lines: [
      "Bring your Avatar, your Spellbook and your Atlas.",
      "Your organizer sets the round length and what happens when time is called. Ask at the counter.",
      "Organizers may adjust the setup or ban cards for their event, so read the event post or ask.",
      "The publisher's own advice: play Sorcery in whatever way you and your friends find most enjoyable.",
    ],
  },
];
