import type { CardDataProvider } from "@/lib/cards/domain";
import type { GameSlug } from "@/lib/players/games-catalog";
import { FabCubeProvider, FABCUBE_KEY } from "./fabcube/adapter";
import { RiftcodexProvider, RIFTCODEX_KEY } from "./riftcodex/adapter";
import { ScryfallProvider, SCRYFALL_KEY } from "./scryfall/adapter";
import { TcgdexProvider, TCGDEX_KEY } from "./tcgdex/adapter";

/**
 * Which public catalogue each game is imported from, and what the
 * admin needs to know to type a set code into it.
 *
 * One Piece is deliberately absent: it has its own sync (optcgapi) and
 * its own by-hand importer, both older than this table, and moving it
 * here would be churn for nothing. Lorcana has no catalogue yet — the
 * founder did not ask for one — and the console says so rather than
 * offering a game that imports nothing.
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

export const CATALOGUE_SOURCES: readonly CatalogueSource[] = [
  {
    game: "mtg",
    providerKey: SCRYFALL_KEY,
    sourceName: "Scryfall",
    sourceUrl: "https://scryfall.com/docs/api",
    setCodeHint: "Scryfall's set code: MH3, BLB, FDN, DSK.",
    wholeGame: false,
    imageHosts: ["cards.scryfall.io"],
  },
  {
    game: "pokemon",
    providerKey: TCGDEX_KEY,
    sourceName: "TCGdex",
    sourceUrl: "https://tcgdex.dev",
    setCodeHint: "TCGdex's set id: sv1, sv8, swsh12, base1.",
    wholeGame: false,
    imageHosts: ["assets.tcgdex.net"],
  },
  {
    game: "flesh-and-blood",
    providerKey: FABCUBE_KEY,
    sourceName: "the-fab-cube",
    sourceUrl: "https://github.com/the-fab-cube/flesh-and-blood-cards",
    setCodeHint:
      "The set's letters: MST, HVY, ROS, HNT. Leave blank for the whole game.",
    wholeGame: true,
    imageHosts: [
      "legendstory-production-s3-public.s3.amazonaws.com",
      "storage.googleapis.com",
    ],
  },
  {
    game: "riftbound",
    providerKey: RIFTCODEX_KEY,
    sourceName: "Riftcodex",
    sourceUrl: "https://riftcodex.com",
    setCodeHint:
      "The set's letters: OGN, UNL, SFD, PRG. Leave blank for the whole game.",
    wholeGame: true,
    imageHosts: ["cmsassets.rgpub.io"],
  },
];

export function catalogueSource(game: string): CatalogueSource | null {
  return CATALOGUE_SOURCES.find((source) => source.game === game) ?? null;
}

/** The adapter for a game, or null for a game with no catalogue. */
export function providerForGame(game: string): CardDataProvider | null {
  switch (game) {
    case "mtg":
      return new ScryfallProvider();
    case "pokemon":
      return new TcgdexProvider();
    case "flesh-and-blood":
      return new FabCubeProvider();
    case "riftbound":
      return new RiftcodexProvider();
    default:
      return null;
  }
}

/** Every host any catalogue's pictures come from. */
export const CATALOGUE_IMAGE_HOSTS: readonly string[] = [
  ...new Set(CATALOGUE_SOURCES.flatMap((source) => source.imageHosts)),
];
