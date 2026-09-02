/**
 * The games cardflare knows about, in the founder's order.
 *
 * Slugs are what `player_games` and `cards.game` store and the check
 * constraints allow; labels are what every screen shows. ONE list,
 * imported by the website, the app's API, the card providers and the
 * tests alike, so a new game is added HERE and in a migration, and
 * nowhere else. Free of server-only imports so the sign-up forms can
 * render choices without a database.
 *
 * The short name is for a chip or a panel header where the full label
 * would wrap: the Event Hub's game profiles carry the same six.
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

export function isGameSlug(value: string): value is GameSlug {
  return (GAME_SLUGS as string[]).includes(value);
}

/** The short name for a chip, or the slug itself for one we do not carry. */
export function gameShortName(slug: string): string {
  return TCG_GAMES.find((game) => game.slug === slug)?.shortName ?? slug;
}

/** The full label, for a heading or a sentence. */
export function gameLabel(slug: string): string {
  return TCG_GAMES.find((game) => game.slug === slug)?.label ?? slug;
}
