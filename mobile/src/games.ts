/**
 * The games cardflare knows about - the app's copy of the website's
 * `src/lib/players/games-catalog.ts`, kept identical on purpose. Slugs
 * are what the server stores; labels are what the picker shows; short
 * names are what a chip shows. tests/unit/app-games-parity.test.ts
 * fails when the two lists disagree.
 */

export const TCG_GAMES = [
  { slug: "one-piece", label: "One Piece TCG", shortName: "One Piece" },
  { slug: "riftbound", label: "Riftbound", shortName: "Riftbound" },
  { slug: "lorcana", label: "Lorcana", shortName: "Lorcana" },
  { slug: "mtg", label: "Magic: The Gathering", shortName: "Magic" },
  { slug: "pokemon", label: "Pokémon", shortName: "Pokémon" },
  { slug: "flesh-and-blood", label: "Flesh and Blood", shortName: "Flesh & Blood" },
] as const;

export type GameSlug = (typeof TCG_GAMES)[number]["slug"];

export const GAME_SLUGS = TCG_GAMES.map((game) => game.slug) as GameSlug[];

export function isGameSlug(value: string | null | undefined): value is GameSlug {
  return (GAME_SLUGS as string[]).includes(value ?? "");
}

export function gameShortName(slug: string): string {
  return TCG_GAMES.find((game) => game.slug === slug)?.shortName ?? slug;
}
