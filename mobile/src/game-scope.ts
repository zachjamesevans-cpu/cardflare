import { GAME_SLUGS, isGameSlug, type GameSlug } from "./games";

/**
 * Which game a card search looks in - the app's copy of the website's
 * `src/lib/cards/game-scope.ts`, kept identical on purpose so the two
 * platforms default the same person to the same game.
 * tests/unit/app-games-parity.test.ts walks both with the same inputs.
 *
 * Strongest source first: the room's game locks the search; then the
 * chip last tapped on this device; then the first game from sign-up.
 * With none of those the search is universal.
 */

export interface GameScopeInput {
  roomGame?: string | null;
  playerGames?: readonly string[];
  remembered?: string | null;
}

export interface GameScope {
  locked: boolean;
  selected: GameSlug | null;
  chips: GameSlug[];
}

export const ALL_GAMES = "all";

export function resolveGameScope(input: GameScopeInput): GameScope {
  const room = input.roomGame ?? null;
  if (room && isGameSlug(room)) {
    return { locked: true, selected: room, chips: [] };
  }

  const mine = (input.playerGames ?? []).filter(isGameSlug);
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
 * The picker's list, in two halves: the games the reader said they
 * play, then everyone else. "All games" is drawn by the picker itself,
 * last, because it is the exception and not a game.
 */
export function splitGames(
  scope: GameScope,
  playerGames: readonly string[] = [],
): { mine: GameSlug[]; others: GameSlug[] } {
  const mine = scope.chips.filter((game) => playerGames.includes(game));
  const others = scope.chips.filter((game) => !playerGames.includes(game));
  return { mine, others };
}

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
