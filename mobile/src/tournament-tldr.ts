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
  "Between rounds you are free: trade, buy singles, post a card you are hunting to the room board.",
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
];
