import type { CardDataProvider } from "@/lib/cards/domain";
import type { GameSlug } from "@/lib/players/games-catalog";
import { SCRYDEX_IMAGE_HOST, SCRYDEX_KEY, ScrydexProvider } from "./scrydex/adapter";

/**
 * Which public catalogue each game is imported from, and what the
 * admin needs to know to type a set code into it.
 *
 * One Piece is deliberately absent: it has its own sync (optcgapi) and
 * its own by-hand importer, both older than this table, and moving it
 * here would be churn for nothing.
 *
 * Free of server-only imports so the admin form can render the list
 * and the tests can read it.
 */

export interface CatalogueSource {
  game: GameSlug;
  providerKey: string;
  /** The source, named honestly on the console: who we are reading from. */
  sourceName: string;
  sourceUrl: string;
  /** How that source spells a set code, with real examples. */
  setCodeHint: string;
  /** Whether the whole game can be pulled with no set code. */
  wholeGame: boolean;
  /** The hosts its pictures are served from, for the render allow-list. */
  imageHosts: readonly string[];
}

export const CATALOGUE_SOURCES: readonly CatalogueSource[] = (
  [
    ["one-piece", "The set's code: OP18, EB05, ST29."],
    ["pokemon", "Scrydex's set id: sv1, sv8, swsh12, base1."],
    ["mtg", "The set's code: MH3, BLB, FDN, DSK."],
    ["lorcana", "The set's code: TFC, ROF, URS."],
    ["riftbound", "The set's code: OGN, SFD, RAD."],
    ["gundam", "The set's code: GD01, GD06, ST01."],
  ] as const
).map(([game, setCodeHint]) => ({
  /* One source for every game: Scrydex (2026-11-25). Flesh and Blood,
     which Scrydex does not carry, has none. */
  game,
  providerKey: SCRYDEX_KEY,
  sourceName: "Scrydex",
  sourceUrl: "https://scrydex.com/docs",
  setCodeHint: `${setCodeHint} Leave blank for the whole game.`,
  wholeGame: true,
  imageHosts: [SCRYDEX_IMAGE_HOST],
}));

export function catalogueSource(game: string): CatalogueSource | null {
  return CATALOGUE_SOURCES.find((source) => source.game === game) ?? null;
}

/** The adapter for a game, or null for a game with no catalogue. */
export function providerForGame(game: string): CardDataProvider | null {
  const source = catalogueSource(game);
  return source ? new ScrydexProvider(source.game) : null;
}

/** Every host any catalogue's pictures come from. */
export const CATALOGUE_IMAGE_HOSTS: readonly string[] = [
  ...new Set(CATALOGUE_SOURCES.flatMap((source) => source.imageHosts)),
];
