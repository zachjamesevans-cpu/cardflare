/**
 * Tournament timer profiles: the five games, as data.
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
 * Five games in version one. A sixth is an entry in `GAME_PROFILES` plus
 * an accent token — deliberately a code change rather than a form field,
 * because a game here fans out into rules a store reads off a wall.
 */

/**
 * The slugs.
 *
 * Styled to match `player_games.game`, which already uses `one-piece`,
 * `pokemon`, `lorcana` and `riftbound`. That table has no Flesh and
 * Blood and does have Magic, so the two lists are not the same list —
 * but four of five line up exactly, which is what a future reconciliation
 * will be glad of.
 */
export type GameId =
  "one-piece" | "pokemon" | "lorcana" | "riftbound" | "flesh-and-blood";

export const GAME_IDS: readonly GameId[] = [
  "one-piece",
  "pokemon",
  "lorcana",
  "riftbound",
  "flesh-and-blood",
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
  officialRulesUrl: string;
  /** ISO date a human last checked this against the publisher. */
  rulesLastVerified: string;
  /** Bumped whenever the steps change, so a stale display is detectable. */
  procedureVersion: string;
}

/**
 * On every overtime overlay, every time.
 *
 * CardFlare is not a rules authority and must never read as one. The
 * shop's judge is the authority; this is a reminder of what they already
 * know, sized to be read from the back of the room.
 */
export const RULES_DISCLAIMER =
  "Quick reference only. Current official tournament rules and event staff/judges control.";

const MIN = 60;

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
      additionalTurns: 3,
      timed: true,
      overtimeSeconds: 5 * MIN,
    },
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
    officialRulesUrl: "https://rules.fabtcg.com/en/trp/03-tournament-logistics/",
    rulesLastVerified: "2026-08-17",
    procedureVersion: "2026.08-trp-logistics",
  },
};

/** The profile, or null for a slug that is not one of the five. */
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
