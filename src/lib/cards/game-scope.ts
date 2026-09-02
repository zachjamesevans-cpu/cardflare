import { GAME_SLUGS, isGameSlug, type GameSlug } from "@/lib/players/games-catalog";

/**
 * Which game a card search looks in, decided once and the same way on
 * both platforms.
 *
 * The founder's rule: nobody should be overwhelmed by their searching.
 * A player who said "One Piece" at sign-up should find One Piece cards
 * without touching a filter; somebody who scanned a Riftbound screen
 * should see Riftbound cards and nothing else. So the scope has three
 * sources, strongest first:
 *
 *   1. THE ROOM. A code scanned off a tournament's own screen names its
 *      game, and inside that room the search is locked to it. No chip
 *      row, no way to widen: that is the whole point of the code.
 *   2. THE PLAYER'S LAST CHOICE. A chip they tapped stays tapped on
 *      their next search, on this device.
 *   3. THE SIGN-UP ANSWER. Their first game from the games question is
 *      pre-selected. Several games are offered as chips, theirs first.
 *
 * With none of those the search is universal, and says so.
 *
 * Pure, so tests/unit/game-scope.test.ts can walk every combination
 * without a database, and so the app's mirror in mobile/src/game-scope.ts
 * can be held to it word for word.
 */

export interface GameScopeInput {
  /** The room's game, from the scanned code. Null when there is none. */
  roomGame?: string | null;
  /** The games the player chose at sign-up, in the founder's order. */
  playerGames?: readonly string[];
  /** The chip the player last tapped on this device, if any. */
  remembered?: string | null;
}

export interface GameScope {
  /** True when the room decided: one chip, no tapping. */
  locked: boolean;
  /** The game to search, or null for every game. */
  selected: GameSlug | null;
  /** The chips to offer, in order. Empty when locked. */
  chips: GameSlug[];
}

/** "All games" is stored as this so a remembered choice of "all" beats a sign-up default. */
export const ALL_GAMES = "all";

export function resolveGameScope(input: GameScopeInput): GameScope {
  const room = input.roomGame ?? null;
  if (room && isGameSlug(room)) {
    return { locked: true, selected: room, chips: [] };
  }

  const mine = (input.playerGames ?? []).filter(isGameSlug);
  /* Theirs first, then the rest in the catalogue's order, no repeats. */
  const chips = [...mine, ...GAME_SLUGS.filter((slug) => !mine.includes(slug))];

  const remembered = input.remembered ?? null;
  if (remembered === ALL_GAMES) {
    return { locked: false, selected: null, chips };
  }
  if (remembered && isGameSlug(remembered)) {
    return { locked: false, selected: remembered, chips };
  }

  return { locked: false, selected: mine[0] ?? null, chips };
}

/**
 * What the search box suggests typing, for the scope it is in. A
 * placeholder that says "OP01-024" above a Magic search teaches the
 * wrong thing; each game gets a real card of its own.
 */
export function searchPlaceholder(game: GameSlug | null): string {
  switch (game) {
    case "one-piece":
      return "OP01-024, or Luffy";
    case "mtg":
      return "MH3-123, or Lightning Bolt";
    case "pokemon":
      return "SV1-001, or Charizard";
    case "flesh-and-blood":
      return "MST131, or Snatch";
    case "riftbound":
      return "OGN-056, or Jinx";
    case "lorcana":
      return "Elsa";
    default:
      return "A card name or number";
  }
}
