/**
 * Tournament timer profiles: every game FlareCast runs a clock for, as data.
 *
 * DEVELOPER NOTE — Tournament rule summaries must be manually reviewed
 * against official publisher documentation periodically. Rules change,
 * and a stale procedure on a shop's television is worse than no
 * procedure at all. Every profile carries `officialRulesUrl`,
 * `rulesLastVerified` and `procedureVersion` so a review has somewhere
 * to land. Nothing here is scraped and nothing is fetched at runtime:
 * publisher sites are read by a person, and this file is edited by a
 * person.
 *
 * The whole point of this module is that no procedure text lives inside
 * a React component. Updating One Piece's extra-turn rule must be an
 * edit to a string array, never a rebuild of a timer.
 *
 * Five games in version one; Magic arrived with the card catalogue, and
 * Yu-Gi-Oh!, Gundam, Cyberpunk and Sorcery arrived for FlareCast alone
 * (2026-11-12). Another is an entry in `GAME_PROFILES` plus an accent
 * token and an additive migration on `event_hub_timers_game` —
 * deliberately a code change rather than a form field, because a game
 * here fans out into rules a store reads off a wall.
 */

/**
 * The slugs.
 *
 * The same slugs `player_games.game` and `cards.game` store: one
 * vocabulary for "which game", reconciled in 20261001140000 after the
 * room's QR (hyphenated) and the cards table (underscored) disagreed
 * and every scoped search came back empty.
 */
export type GameId =
  | "one-piece"
  | "pokemon"
  | "lorcana"
  | "riftbound"
  | "flesh-and-blood"
  | "mtg"
  | "yugioh"
  | "gundam"
  | "cyberpunk"
  | "sorcery";

/*
 * Every game FlareCast runs a clock for: the six of the card catalogue,
 * then four that are FlareCast only.
 *
 * The first six are the same slugs as `TCG_GAMES` in
 * players/games-catalog.ts, and tests/unit/app-games-parity.test.ts
 * holds them equal: a tournament's QR carries one of these, the room's
 * card search compares it to `cards.game`, and the sign-up question
 * stores it, so the three cannot be allowed to drift again.
 *
 * The last four have rules and timers and no cards. The founder
 * (2026-11-11): "add sorcery, Gundam, cyberpunk, and yugioh to
 * FlareCast with their respective rules and timers", and on scope,
 * "FlareCast only". So they are not in the catalogue, not in the
 * sign-up question and not in a store's games, and a tournament QR
 * for one of them leaves the room's card search on the player's own
 * games (e/[code]/page.tsx) instead of narrowing it to a game with no
 * cards. `FLARECAST_ONLY` names them so nothing has to guess.
 */
export const GAME_IDS: readonly GameId[] = [
  "one-piece",
  "pokemon",
  "lorcana",
  "riftbound",
  "flesh-and-blood",
  "mtg",
  "yugioh",
  "gundam",
  "cyberpunk",
  "sorcery",
];

/** Games with timers and rules here and no cards in the catalogue. */
export const FLARECAST_ONLY: readonly GameId[] = [
  "yugioh",
  "gundam",
  "cyberpunk",
  "sorcery",
];

/** Which set of end-of-round rules applies. */
export type Bracket = "swiss" | "elimination";

export interface TimerPreset {
  id: string;
  label: string;
  /** Regulation length in seconds. Null means the round is untimed. */
  durationSeconds: number | null;
  /**
   * The overtime countdown this preset implies, in seconds.
   *
   * Null where the game's procedure is a number of turns rather than a
   * clock — which is most of them. Inventing a countdown for those would
   * be putting a rule on a wall that the publisher never wrote.
   */
  overtimeSeconds: number | null;
  /** One short line for the picker, where the label is not enough. */
  note?: string;
}

export interface OvertimeProcedure {
  /**
   * The one line a player reads from across the shop. "+5 TURNS",
   * "+3 TURNS · 5:00". Not a sentence.
   */
  headline: string;
  /** Three to six short steps. Numbered on screen. */
  steps: string[];
  /** Ordered tiebreak comparisons, shown smaller. */
  tiebreak?: string[];
  /**
   * The one instruction line above the tiebreaks during EXTRA TIME.
   *
   * Extra time gets a compact card — the founder: "it's just showing
   * tiebreakers in order explained quickly" — and this is the only
   * sentence of procedure on it. Lives here, not in a component, for
   * the same reason as every other string in this file.
   */
  extraTimeLine?: string;
  /** Additional turns, for the staff turn tracker. Zero disables it. */
  additionalTurns: number;
  /** Whether staff may start a countdown for this procedure. */
  timed: boolean;
  /** Seconds on that countdown. Null whenever `timed` is false. */
  overtimeSeconds: number | null;
}

export interface GameProfile {
  id: GameId;
  displayName: string;
  /** For a timer panel header, where the full name would wrap. */
  shortName: string;
  /**
   * The CSS custom property carrying this game's accent.
   *
   * A token name, never a literal: brand colour lives in the `@theme`
   * block in globals.css and `tests/unit/design-tokens.test.ts` holds
   * each of these to AA against the display's background.
   */
  accentToken: string;
  presets: TimerPreset[];
  defaultPresetId: string;
  swiss: OvertimeProcedure;
  elimination: OvertimeProcedure;
  /**
   * A first tournament, in a few sentences.
   *
   * Written for the player standing in a shop deciding whether to enter,
   * not for a judge. Match format, what a round feels like, and the one
   * thing about time they should not be surprised by. The founder's ask:
   * "just a way where they feel comfortable [entering] tournaments."
   */
  beginnerTldr: readonly string[];
  officialRulesUrl: string;
  /** ISO date a human last checked this against the publisher. */
  rulesLastVerified: string;
  /** Bumped whenever the steps change, so a stale display is detectable. */
  procedureVersion: string;
}

/**
 * On every overtime overlay, every time.
 *
 * cardflare is not a rules authority and must never read as one. The
 * shop's judge is the authority; this is a reminder of what they already
 * know, sized to be read from the back of the room.
 */
export const RULES_DISCLAIMER =
  "Quick reference only. Current official tournament rules and event staff/judges control.";

const MIN = 60;

/**
 * What a tournament night is, before any game's specifics.
 *
 * One list rather than five copies, because the things that make a
 * first-timer comfortable are the same in every game: how you enter,
 * what a round is, and the fact that nobody expects you to be good.
 */
export const NIGHT_BASICS: readonly string[] = [
  "Turn up, tell the counter you are playing, and pay the entry if there is one. That is the whole sign-up.",
  "Everyone plays every round - it is not a knockout. You get paired against someone new each round.",
  "A round has a clock, and the big screen counts it down. When it hits zero you finish the turn you are in; the screen shows exactly what happens next.",
  "Between rounds you are free: trade, buy singles, post a card you are looking for to the room board.",
  "Nobody expects you to know everything. Tell your opponent it is your first event - it goes well.",
];

export const GAME_PROFILES: Record<GameId, GameProfile> = {
  "one-piece": {
    id: "one-piece",
    displayName: "One Piece Card Game",
    shortName: "One Piece",
    accentToken: "--color-game-one-piece",
    presets: [
      {
        id: "store-tournament",
        label: "Store Tournament",
        durationSeconds: 35 * MIN,
        overtimeSeconds: 5 * MIN,
        note: "35:00 regulation, 5:00 extra time",
      },
      {
        id: "standard-qualifying",
        label: "Standard Qualifying",
        durationSeconds: 30 * MIN,
        overtimeSeconds: 5 * MIN,
        note: "30:00 regulation, 5:00 extra time",
      },
      {
        id: "top-cut",
        label: "Top Cut",
        durationSeconds: 60 * MIN,
        overtimeSeconds: 10 * MIN,
        note: "60:00 regulation, 10:00 extra time",
      },
    ],
    defaultPresetId: "store-tournament",
    swiss: {
      headline: "+3 TURNS · 5:00",
      steps: [
        "Finish the current turn. That turn is Turn 0.",
        "Then play Turn 1, Turn 2 and Turn 3.",
        "A normal win during those turns ends the game normally.",
        "Nobody won after Turn 3? Compare in this order.",
        "If the extra-time clock runs out, finish the attack in progress through End of Battle, and resolve any effect already activated.",
        "Still no winner after the official procedure? The match may be recorded as a draw.",
      ],
      tiebreak: [
        "Most Life cards remaining",
        "Most cards remaining in deck",
        "Most Characters in the Character area",
        "Whoever most recently removed a card from their Life",
      ],
      extraTimeLine:
        "Finish the current turn, then play 3 more. Nobody has won? Compare in order:",
      additionalTurns: 3,
      timed: true,
      overtimeSeconds: 5 * MIN,
    },
    elimination: {
      headline: "+3 TURNS · NO DRAWS",
      steps: [
        "Draws are not permitted.",
        "Tied on game wins? Finish the current turn as Turn 0.",
        "Then play Turn 1, Turn 2 and Turn 3.",
        "Nobody wins normally? Compare in this order.",
        "Still no winner? Follow current official event procedure.",
        "The Championship Match may be untimed depending on event rules.",
      ],
      tiebreak: [
        "Most Life cards remaining",
        "Most cards remaining in deck",
        "Most Characters in the Character area",
        "Whoever most recently removed a card from their Life",
      ],
      extraTimeLine:
        "Finish the current turn, then play 3 more. No draws. Nobody has won? Compare in order:",
      additionalTurns: 3,
      timed: true,
      overtimeSeconds: 5 * MIN,
    },
    beginnerTldr: [
      "Bring a 50-card deck plus your Leader and 10 DON!! cards. Sleeves are worth it.",
      "Matches are usually one game, about 35 minutes on the clock.",
      "When time is called you finish the current turn plus three more. The screen walks everyone through it.",
      "Casual store events expect nothing from you except your deck. Judges and opponents help new players constantly.",
    ],
    officialRulesUrl: "https://en.onepiece-cardgame.com/rules/",
    rulesLastVerified: "2026-08-17",
    procedureVersion: "2026.08-store-tournament-vol1",
  },

  pokemon: {
    id: "pokemon",
    displayName: "Pokémon TCG",
    shortName: "Pokémon",
    accentToken: "--color-game-pokemon",
    presets: [
      {
        id: "championship-bo3",
        /*
         * Named for the event type, not the game. The +3 turn / 15:00
         * procedure below is the Play! Pokémon CHAMPIONSHIP-event
         * procedure, and telling a shop that their Tuesday league has to
         * run it would be inventing policy.
         */
        label: "Championship Series (Bo3)",
        durationSeconds: 50 * MIN,
        overtimeSeconds: 15 * MIN,
        note: "50:00 regulation, 15:00 overtime",
      },
      {
        id: "prerelease-bo1",
        label: "Prerelease / casual (Bo1)",
        durationSeconds: 30 * MIN,
        overtimeSeconds: null,
        note: "30:00 suggested. Follow your event's own end-of-round rules.",
      },
    ],
    defaultPresetId: "championship-bo3",
    swiss: {
      headline: "+3 TURNS · 15:00",
      steps: [
        "The active player finishes their current turn.",
        "Then play 3 additional turns.",
        "The opponent takes the first additional turn, and also the third.",
        "If the match finishes normally, overtime stops.",
        "If the match is still unresolved, call a Judge and follow the current Play! Pokémon TCG Tournament Handbook.",
      ],
      additionalTurns: 3,
      timed: true,
      overtimeSeconds: 15 * MIN,
    },
    elimination: {
      headline: "+3 TURNS · 15:00",
      steps: [
        "The active player finishes their current turn.",
        "Then play 3 additional turns.",
        "The opponent takes the first additional turn, and also the third.",
        "If the match finishes normally, overtime stops.",
        "A winner is required here. Call a Judge and follow the current Play! Pokémon TCG Tournament Handbook.",
      ],
      additionalTurns: 3,
      timed: true,
      overtimeSeconds: 15 * MIN,
    },
    beginnerTldr: [
      "Bring a 60-card deck. Write a deck list if the event asks; staff will help you with it.",
      "Most locals are best-of-one, around 30 minutes, or best-of-three at 50.",
      "When time is called you play a set number of extra turns, then the game state decides.",
      "League nights are built for beginners. Losing rounds is normal and nobody tracks it.",
    ],
    officialRulesUrl: "https://play.pokemon.com/en-us/resources/documents/",
    rulesLastVerified: "2026-08-17",
    procedureVersion: "2026.08-championship-end-of-round",
  },

  lorcana: {
    id: "lorcana",
    displayName: "Disney Lorcana TCG",
    shortName: "Lorcana",
    accentToken: "--color-game-lorcana",
    presets: [
      {
        id: "swiss",
        label: "Swiss",
        durationSeconds: 50 * MIN,
        overtimeSeconds: null,
        note: "50:00. Stores may raise this to 60:00.",
      },
      {
        id: "single-elimination",
        label: "Single Elimination",
        durationSeconds: null,
        overtimeSeconds: null,
        note: "Untimed. Add a clock only if your venue needs one.",
      },
    ],
    defaultPresetId: "swiss",
    swiss: {
      headline: "+5 TURNS",
      steps: [
        "The active player finishes their current turn. This is Turn 0.",
        "Then play 5 additional turns. Turn 0 is not one of the five.",
        "A win during those turns ends the game normally.",
        "After Turn 5 an unfinished game is recorded as a draw.",
        "More completed game wins takes the match. Equal game wins is a draw.",
      ],
      additionalTurns: 5,
      timed: false,
      overtimeSeconds: null,
    },
    elimination: {
      headline: "+5 TURNS · LORE DECIDES",
      steps: [
        "Already ahead on game wins when time is called? That player wins the match.",
        "Tied on game wins? Play 5 additional turns.",
        "No game in progress? A new game may begin for this procedure.",
        "Nobody wins by the end of the five? Compare Lore. More Lore wins.",
        "Lore tied? Keep playing. The first player to take the Lore lead wins.",
      ],
      additionalTurns: 5,
      timed: false,
      overtimeSeconds: null,
    },
    beginnerTldr: [
      "Bring a 60-card deck of up to two ink colours.",
      "Matches are usually best-of-one at 30 minutes, or best-of-three at 50. First to 20 lore wins.",
      "When time is called you finish the turn plus extra turns, and lore decides if nobody got to 20.",
      "Lorcana locals skew friendly and new-player heavy. Ask your opponent anything mid-game.",
    ],
    officialRulesUrl:
      "https://files.disneylorcana.com/Tournament-Rules-7.14.2026_Update_EN.pdf",
    rulesLastVerified: "2026-08-17",
    procedureVersion: "2026.07.14-tournament-rules",
  },

  riftbound: {
    id: "riftbound",
    displayName: "Riftbound",
    shortName: "Riftbound",
    accentToken: "--color-game-riftbound",
    presets: [
      {
        id: "swiss",
        label: "Swiss",
        durationSeconds: 50 * MIN,
        overtimeSeconds: null,
        note: "50:00 regulation",
      },
      {
        id: "playoff",
        label: "Playoff",
        durationSeconds: null,
        overtimeSeconds: null,
        note: "Untimed",
      },
    ],
    defaultPresetId: "swiss",
    swiss: {
      headline: "+5 TURNS · UNTIL MATCH ENDS",
      steps: [
        "The current player finishes their turn.",
        "Then play 5 additional turns. These are untimed.",
        "Game still unfinished? Higher score wins that game. Tied score is a draw.",
        "More game wins takes the match. Tied game wins is a draw.",
        "Between games when time expires? Do not start another game.",
      ],
      additionalTurns: 5,
      timed: false,
      overtimeSeconds: null,
    },
    elimination: {
      headline: "+5 TURNS · UNTIL MATCH ENDS",
      steps: [
        "The current player finishes their turn.",
        "Then play 5 additional turns. These are untimed.",
        "Game still unfinished? Higher score wins that game.",
        "More game wins takes the match.",
        "A winner is required here. Call a Judge and follow current official tournament rules.",
      ],
      additionalTurns: 5,
      timed: false,
      overtimeSeconds: null,
    },
    beginnerTldr: [
      "Bring your main deck, your Legend, and your battlefield cards. The shop can check it's legal.",
      "Matches at locals are typically best-of-one, about 40 minutes.",
      "When time is called you finish the current turn plus extra turns; the procedure on the screen decides from there.",
      "The game is new for everyone, so tables explain rules to each other all night.",
    ],
    officialRulesUrl:
      "https://playriftbound.com/en-us/news/organizedplay/riftbound-tournament-rules/",
    rulesLastVerified: "2026-08-17",
    procedureVersion: "2026.08-tournament-rules",
  },

  "flesh-and-blood": {
    id: "flesh-and-blood",
    displayName: "Flesh and Blood",
    shortName: "Flesh & Blood",
    accentToken: "--color-game-flesh-and-blood",
    presets: [
      {
        id: "classic-constructed",
        label: "Classic Constructed",
        durationSeconds: 55 * MIN,
        overtimeSeconds: null,
        note: "55:00 regulation",
      },
      {
        id: "blitz",
        label: "Blitz",
        durationSeconds: 35 * MIN,
        overtimeSeconds: null,
        note: "35:00 regulation",
      },
      {
        id: "sealed-deck",
        label: "Sealed Deck",
        durationSeconds: 35 * MIN,
        overtimeSeconds: null,
        note: "35:00 regulation",
      },
      {
        id: "booster-draft",
        label: "Booster Draft",
        durationSeconds: 35 * MIN,
        overtimeSeconds: null,
        note: "35:00 regulation",
      },
      {
        id: "welcome-deck",
        label: "Welcome Deck",
        durationSeconds: 30 * MIN,
        overtimeSeconds: null,
        note: "30:00 regulation",
      },
    ],
    defaultPresetId: "classic-constructed",
    swiss: {
      headline: "+1 TURN",
      steps: [
        "The current turn player finishes their turn.",
        "Then play 1 additional turn.",
        "Nobody wins by the end of it? The current game is a draw.",
        "More game wins takes the match. Equal game wins is a draw.",
      ],
      additionalTurns: 1,
      timed: false,
      overtimeSeconds: null,
    },
    elimination: {
      headline: "CALL A JUDGE",
      steps: [
        "Call a Judge for elimination tiebreak procedures.",
        "If the game is not progressing, a Judge may determine it by hero life total. The higher life total wins that game.",
        "Match still tied? Begin a tiebreaker game.",
        "Play 4 turns total, two per player.",
        "After those four turns, play on until one hero has a higher life total. That hero's owner wins the match.",
        "Tiebreaker game itself a draw? The higher pre-match standing wins.",
      ],
      additionalTurns: 4,
      timed: false,
      overtimeSeconds: null,
    },
    beginnerTldr: [
      "Bring a 60-card deck plus your hero, weapons and equipment - 80 cards total in Classic Constructed.",
      "Matches are usually one game at 50 minutes. Life totals decide a lot, so track them carefully.",
      "When time is called you finish the current turn plus extra turns, and remaining life decides a draw.",
      "Armory nights exist specifically for learning. Say you are new and the whole table adjusts.",
    ],
    officialRulesUrl: "https://rules.fabtcg.com/en/trp/03-tournament-logistics/",
    rulesLastVerified: "2026-08-17",
    procedureVersion: "2026.08-trp-logistics",
  },

  mtg: {
    id: "mtg",
    displayName: "Magic: The Gathering",
    shortName: "Magic",
    accentToken: "--color-game-mtg",
    presets: [
      {
        id: "constructed",
        label: "Constructed",
        durationSeconds: 50 * MIN,
        overtimeSeconds: null,
        note: "50:00 regulation",
      },
      {
        id: "limited",
        label: "Limited (Draft / Sealed)",
        durationSeconds: 50 * MIN,
        overtimeSeconds: null,
        note: "50:00 regulation",
      },
      {
        id: "commander",
        label: "Commander pod",
        durationSeconds: 80 * MIN,
        overtimeSeconds: null,
        note: "80:00 suggested. Follow your event's own end-of-round rules.",
      },
      {
        id: "top-8",
        label: "Top 8 (untimed)",
        durationSeconds: null,
        overtimeSeconds: null,
        note: "Untimed. Playoff rounds run to a result.",
      },
    ],
    defaultPresetId: "constructed",
    swiss: {
      headline: "+5 TURNS",
      steps: [
        "The active player finishes the current turn. That turn is Turn 0.",
        "Then play 5 additional turns, alternating as normal.",
        "A normal win during those turns ends the game normally.",
        "Nobody has won by the end of Turn 5? The game is a draw.",
        "More game wins takes the match. Equal game wins is a drawn match.",
      ],
      extraTimeLine:
        "Finish the current turn, then play 5 more. Nobody has won? It is a draw.",
      additionalTurns: 5,
      timed: false,
      overtimeSeconds: null,
    },
    elimination: {
      headline: "+5 TURNS · SUDDEN DEATH",
      steps: [
        "The active player finishes the current turn. That turn is Turn 0.",
        "Then play 5 additional turns.",
        "Still no winner? Call a Judge: playoff rounds continue under sudden death.",
        "In sudden death, the first player whose life total is lower than the opponent's at any moment loses the game.",
        "Follow the current Magic Tournament Rules for anything the Judge rules on.",
      ],
      extraTimeLine:
        "Finish the current turn, then play 5 more. Still tied? Sudden death, with a Judge.",
      additionalTurns: 5,
      timed: false,
      overtimeSeconds: null,
    },
    beginnerTldr: [
      "Bring a 60-card deck for Constructed, or nothing at all for a draft: you build from packs at the table.",
      "Matches are best-of-three at 50 minutes. Sideboarding between games is normal and nobody minds if you skip it.",
      "When time is called you finish the current turn plus five more, and an unfinished game is a draw.",
      "Friday Night Magic is the beginner event. Say it is your first one and your opponent will walk you through it.",
    ],
    officialRulesUrl:
      "https://media.wizards.com/ContentResources/WotC/Magic_The_Gathering/tournament_rules.html",
    rulesLastVerified: "2026-09-02",
    procedureVersion: "2026.09-mtr-end-of-match",
  },

  /*
   * YU-GI-OH! — Konami Digital Entertainment (KDE-US) Tournament Policy
   * v2.5, in effect 5 September 2025. There is no end-of-match
   * procedure any more: "If the Match does not finish within 50
   * minutes, the result will be a double loss. When time ends in the
   * Round, the Match is over. Neither Duelist may begin or continue any
   * action." So no extra turns and no tiebreaks, and the screen says
   * exactly that rather than borrowing another game's procedure.
   */
  yugioh: {
    id: "yugioh",
    displayName: "Yu-Gi-Oh! TCG",
    shortName: "Yu-Gi-Oh!",
    accentToken: "--color-game-yugioh",
    presets: [
      {
        id: "swiss",
        label: "Swiss (Bo3)",
        durationSeconds: 50 * MIN,
        overtimeSeconds: null,
        note: "50:00. Time ends the match, with no extra turns.",
      },
      {
        id: "top-cut",
        label: "Top Cut (Bo3)",
        durationSeconds: 50 * MIN,
        overtimeSeconds: null,
        note: "50:00 unless the organizer announced a longer playoff round before the event.",
      },
      {
        id: "final",
        label: "Final match (untimed)",
        durationSeconds: null,
        overtimeSeconds: null,
        note: "The final match of the event is untimed.",
      },
    ],
    defaultPresetId: "swiss",
    swiss: {
      headline: "TIME · MATCH OVER",
      steps: [
        "When time is called, the match is over. Nobody begins or continues any action.",
        "A match is finished when a player has won 2 duels or lost 2 duels.",
        "A match that has not finished is a double loss.",
        "Three duels done, time left and no result yet? Play a 4th duel.",
        "Report the result within 5 minutes of the round ending.",
      ],
      extraTimeLine:
        "Time. The match is over: nobody begins or continues any action. Unfinished is a double loss.",
      additionalTurns: 0,
      timed: false,
      overtimeSeconds: null,
    },
    elimination: {
      headline: "TIME · MATCH OVER",
      steps: [
        "Playoff rounds end the same way as Swiss rounds.",
        "When time is called, the match is over. Nobody begins or continues any action.",
        "A match is finished when a player has won 2 duels or lost 2 duels.",
        "A match that has not finished is a double loss.",
        "The final match of the event is untimed.",
      ],
      extraTimeLine:
        "Time. The match is over: nobody begins or continues any action. Unfinished is a double loss.",
      additionalTurns: 0,
      timed: false,
      overtimeSeconds: null,
    },
    beginnerTldr: [
      "Bring a Main Deck of 40 to 60 cards and a Side Deck of up to 15, no more than 3 copies of a card. Sleeves are worth it.",
      "Matches are best-of-three duels on a 50-minute clock.",
      "When time is called the match simply ends, and an unfinished match is a loss for both players, so keep a steady pace.",
      "Locals expect nothing from you except your deck. Tell your opponent it is your first event.",
    ],
    officialRulesUrl:
      "https://img.yugioh-card.com/en/downloads/penalty_guide/YGOTCG_Tournament_Policy_v_2_5.pdf",
    rulesLastVerified: "2026-11-11",
    procedureVersion: "2025.09.05-kde-us-policy-v2.5",
  },

  /*
   * GUNDAM CARD GAME — Bandai's Organized Play Tournament Rules Manual
   * (last updated 10 July 2025) and Sanctioned Tournament Floor Rules
   * Ver. 1.1.0 (19 November 2025). Standard is best-of-one at 30:00;
   * Top Cut Finals best-of-three at 60:00; the Championship match is
   * untimed. "Stores may choose to adjust the format", which is what
   * a custom length is for.
   */
  gundam: {
    id: "gundam",
    displayName: "Gundam Card Game",
    shortName: "Gundam",
    accentToken: "--color-game-gundam",
    presets: [
      {
        id: "standard",
        label: "Standard (Bo1)",
        durationSeconds: 30 * MIN,
        overtimeSeconds: 5 * MIN,
        note: "30:00 regulation, 5:00 on the extra turns",
      },
      {
        id: "top-cut",
        label: "Top Cut Finals (Bo3)",
        durationSeconds: 60 * MIN,
        overtimeSeconds: 10 * MIN,
        note: "60:00 regulation, 10:00 extra time",
      },
      {
        id: "championship",
        label: "Championship (untimed)",
        durationSeconds: null,
        overtimeSeconds: null,
        note: "The Championship match has no time limit.",
      },
    ],
    defaultPresetId: "standard",
    swiss: {
      headline: "+2 OR 3 TURNS · 5:00",
      steps: [
        "More game wins takes the match. Tied? Finish the current turn. That turn is Turn 0.",
        "Time ran out on the first player's turn: play 3 more turns. On the second player's turn: play 2 more.",
        "Nobody wins during those turns? Compare in this order.",
        "If the 5:00 on the extra turns runs out, finish an attack through the Battle End Step, finish any effect already started, and stop at the end of the Main Phase.",
        "Still no clear winner? Both players lose.",
      ],
      tiebreak: [
        "Most cards in the Shield Area (Base and Shields)",
        "Most cards remaining in deck",
      ],
      extraTimeLine:
        "Finish the turn, then 3 more if time ran out on the first player's turn, 2 on the second's. Nobody has won? Compare in order:",
      additionalTurns: 3,
      timed: true,
      overtimeSeconds: 5 * MIN,
    },
    elimination: {
      headline: "+2 OR 3 TURNS · NO DRAWS",
      steps: [
        "Draws are not permitted. More game wins takes the match.",
        "Tied? Finish the current turn as Turn 0, then 3 more turns if time ran out on the first player's turn, 2 on the second's.",
        "Nobody wins during those turns? Compare in this order.",
        "If the extra-turn clock runs out, finish an attack through the Battle End Step and stop at the end of the Main Phase.",
        "The Championship match is untimed.",
      ],
      tiebreak: [
        "Most cards in the Shield Area (Base and Shields)",
        "Most cards remaining in deck",
        "Most Units in the Battle Area",
        "Whoever most recently removed a card from their Shield Area",
      ],
      extraTimeLine:
        "Finish the turn, then 3 more (first player's turn) or 2 (second's). No draws. Nobody has won? Compare in order:",
      additionalTurns: 3,
      timed: true,
      overtimeSeconds: 5 * MIN,
    },
    beginnerTldr: [
      "Bring a 50-card deck and a 10-card Resource Deck, plus any tokens your deck makes.",
      "Store tournaments are usually one game on a 30-minute clock.",
      "When time is called you finish the turn plus 2 or 3 more, then Shields and deck size decide.",
      "Store events are the place to learn. Ask your opponent anything mid-game.",
    ],
    officialRulesUrl: "https://www.gundam-gcg.com/en/events/storetournament_01.html",
    rulesLastVerified: "2026-11-11",
    procedureVersion: "2025.11.19-floor-rules-1.1.0",
  },

  /*
   * CYBERPUNK TCG — the official Tournament Rules (cyberpunktcg.com,
   * updated 28 October 2026), "Round-end Procedure". Each player has
   * 5:00 for their own final turn: two clocks, one per turn, so no
   * single overtime countdown is put on the wall for it.
   */
  cyberpunk: {
    id: "cyberpunk",
    displayName: "Cyberpunk TCG",
    shortName: "Cyberpunk",
    accentToken: "--color-game-cyberpunk",
    presets: [
      {
        id: "swiss-bo3",
        label: "Swiss (Bo3)",
        durationSeconds: 50 * MIN,
        overtimeSeconds: null,
        note: "50:00 regulation",
      },
      {
        id: "swiss-bo1",
        label: "Swiss (Bo1)",
        durationSeconds: 30 * MIN,
        overtimeSeconds: null,
        note: "30:00, plus 3:00 to sideboard before the round",
      },
      {
        id: "top-cut-bo3",
        label: "Top Cut (Bo3)",
        durationSeconds: 75 * MIN,
        overtimeSeconds: null,
        note: "75:00 regulation",
      },
      {
        id: "top-cut-bo1",
        label: "Top Cut (Bo1)",
        durationSeconds: 55 * MIN,
        overtimeSeconds: null,
        note: "55:00 regulation",
      },
    ],
    defaultPresetId: "swiss-bo3",
    swiss: {
      headline: "+2 TURNS · 7 GIGS",
      steps: [
        "Finish the current turn.",
        "Then each player takes one more full turn, with 5:00 to finish it.",
        "After those two turns, a player with 7 or more Gig dice wins the game. Otherwise the game is a draw.",
        "More game wins takes the match. Equal game wins is a drawn match.",
      ],
      extraTimeLine:
        "Finish the turn, then one more each, 5:00 per turn. 7 or more Gig dice wins; otherwise a draw.",
      additionalTurns: 2,
      timed: false,
      overtimeSeconds: null,
    },
    elimination: {
      headline: "+2 TURNS · THEN MOST GIGS",
      steps: [
        "Finish the current turn.",
        "Then each player takes one more full turn, with 5:00 to finish it.",
        "After those two turns, a player with 7 or more Gig dice wins the game.",
        "Still no winner? Keep playing until one player has more Gigs than the other.",
        "More game wins takes the match.",
      ],
      extraTimeLine:
        "Finish the turn, then one more each, 5:00 per turn. No 7 Gigs? Play on until one player has more.",
      additionalTurns: 2,
      timed: false,
      overtimeSeconds: null,
    },
    beginnerTldr: [
      "Bring a 40 to 50 card deck, exactly 3 Legends and your Gig dice. A sealed event hands you the cards.",
      "Locals are best-of-three at 50 minutes, or best-of-one at 30.",
      "When time is called you finish the turn, each player takes one more, and 7 Gig dice wins.",
      "Night City Gauntlet events are casual by design: judges there are told to teach, not punish.",
    ],
    officialRulesUrl: "https://cyberpunktcg.com/tournament-rules",
    rulesLastVerified: "2026-11-12",
    procedureVersion: "2026.10.28-round-end",
  },

  /*
   * SORCERY: CONTESTED REALM — the Codex's "Tournament Rules" entry is
   * the whole of the publisher's word on tournaments, and it sets no
   * round length and no end-of-round procedure: "Tournament organizers
   * are empowered to modify the rules to maximize the fun of the
   * players in their community". Inventing either here would be
   * putting a rule on a wall that the publisher never wrote, so the
   * preset is untimed until the store types its own minutes, and the
   * procedure tells the room to listen to its organizer.
   */
  sorcery: {
    id: "sorcery",
    displayName: "Sorcery: Contested Realm",
    shortName: "Sorcery",
    accentToken: "--color-game-sorcery",
    presets: [
      {
        id: "organizer",
        label: "Organizer's round",
        durationSeconds: null,
        overtimeSeconds: null,
        note: "Sorcery's publisher sets no round length. Enter your event's minutes as a custom length.",
      },
    ],
    defaultPresetId: "organizer",
    swiss: {
      headline: "ORGANIZER DECIDES",
      steps: [
        "Sorcery's publisher sets no end-of-round procedure.",
        "Your organizer announces what happens when time is called. Follow that.",
        "Organizers may also change setup rules or ban cards for their event. Ask before round one.",
        "Both Avatars dealt a death blow at once? The rules make it a draw, but many tournaments ignore it and play on. Check your event.",
      ],
      extraTimeLine: "Time. Follow your organizer's end-of-round rules.",
      additionalTurns: 0,
      timed: false,
      overtimeSeconds: null,
    },
    elimination: {
      headline: "ORGANIZER DECIDES",
      steps: [
        "Sorcery's publisher sets no end-of-round procedure.",
        "Your organizer announces what happens when time is called. Follow that.",
        "A winner is required here. Call your organizer.",
      ],
      extraTimeLine: "Time. Follow your organizer's end-of-round rules.",
      additionalTurns: 0,
      timed: false,
      overtimeSeconds: null,
    },
    beginnerTldr: [
      "Bring your Avatar, your Spellbook and your Atlas.",
      "Your organizer sets the round length and what happens when time is called. Ask at the counter.",
      "Organizers may adjust the setup or ban cards for their event, so read the event post or ask.",
      "The publisher's own advice: play Sorcery in whatever way you and your friends find most enjoyable.",
    ],
    officialRulesUrl:
      "https://sorcerytcg.com/codex/c50ff53f-9b65-4695-8cf5-082a2a890106",
    rulesLastVerified: "2026-11-12",
    procedureVersion: "2026.11-codex-tournament-rules",
  },
};

/** The profile, or null for a slug that is not one of FlareCast's games. */
export function gameProfile(id: string): GameProfile | null {
  return GAME_PROFILES[id as GameId] ?? null;
}

/** The preset, or null. Falls back to nothing — the caller decides. */
export function timerPreset(game: GameId, presetId: string): TimerPreset | null {
  return GAME_PROFILES[game].presets.find((preset) => preset.id === presetId) ?? null;
}

/** Which procedure applies to a timer, given its bracket. */
export function procedureFor(
  profile: GameProfile,
  bracket: Bracket,
): OvertimeProcedure {
  return bracket === "elimination" ? profile.elimination : profile.swiss;
}

/** Every game, in the order a picker should show them. */
export function allProfiles(): GameProfile[] {
  return GAME_IDS.map((id) => GAME_PROFILES[id]);
}

/**
 * Whether a tournament's name is just the game's name again.
 *
 * The founder's rule, first written for cosmetics and true here too: a
 * name never repeats the category it is already sitting under. A panel
 * headed ONE PIECE with "One Piece Card Game" under it says the same
 * thing twice and wastes the line that should carry "Friday Night
 * Locals".
 *
 * Compared on letters and digits only, so "One Piece TCG" and
 * "one-piece" collapse to the same answer as the full name.
 */
export function nameRepeatsGame(profile: GameProfile, eventName: string): boolean {
  const bare = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

  const name = bare(eventName);
  if (!name) return true;

  return [profile.displayName, profile.shortName, profile.id].some((candidate) => {
    const other = bare(candidate);
    return name === other || name.includes(other) || other.includes(name);
  });
}
