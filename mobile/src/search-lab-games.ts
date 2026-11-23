import { TCG_GAMES, type GameSlug } from "./games";

/**
 * The games the experiment's Search offers, in the order of TCG_GAMES.
 *
 * `catalog` says whether the card database has that game's cards. It is
 * a checked fact, not a guess: on 2026-11-22 the live search answered
 * every game but Riftbound (asked "the", "jinx", "ahri", "ri": nothing),
 * so Riftbound is drawn as "Coming soon" and cannot be chosen, rather
 * than opening an empty catalogue. Flip it when Riftbound is imported.
 */
const NO_CATALOG: ReadonlySet<GameSlug> = new Set(["riftbound"]);

export interface LabGame {
  slug: GameSlug;
  name: string;
  catalog: boolean;
}

/* Games you can search first; one still coming last, so the grid and
   the chips never lead with a door that does not open. */
export const LAB_GAMES: LabGame[] = TCG_GAMES.map((game) => ({
  slug: game.slug,
  name: game.shortName,
  catalog: !NO_CATALOG.has(game.slug),
})).sort((a, b) => Number(b.catalog) - Number(a.catalog));

/** A stored or tapped scope, kept only when it is a game with cards. */
export function labScope(value: string | null | undefined): GameSlug | null {
  const game = LAB_GAMES.find((entry) => entry.slug === value);
  return game?.catalog ? game.slug : null;
}

/** The empty line for a search, naming the game when one is chosen. */
export function noCardsLine(query: string, game: GameSlug | null): string {
  const name = LAB_GAMES.find((entry) => entry.slug === game)?.name;
  return name
    ? `No ${name} cards match "${query}".`
    : `No cards match "${query}".`;
}

/** "+3 printings" under a result with more than one, else null. */
export function printingsLine(count: number): string | null {
  return count > 1 ? `+${count - 1} ${count - 1 === 1 ? "printing" : "printings"}` : null;
}
