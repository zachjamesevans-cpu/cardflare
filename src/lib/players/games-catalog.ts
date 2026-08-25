/**
 * The games cardflare knows about, in the founder's order.
 *
 * Slugs are what `player_games` stores and the check constraint allows;
 * labels are what every screen shows. One list, imported by the website,
 * the app's API and the tests alike, so a new game is added HERE and in
 * a migration, and nowhere else. Free of server-only imports so the
 * sign-up forms can render choices without a database.
 */

export const TCG_GAMES = [
  { slug: "one-piece", label: "One Piece TCG" },
  { slug: "riftbound", label: "Riftbound" },
  { slug: "lorcana", label: "Lorcana" },
  { slug: "mtg", label: "Magic: The Gathering" },
  { slug: "pokemon", label: "Pokémon" },
] as const;

export type GameSlug = (typeof TCG_GAMES)[number]["slug"];

export const GAME_SLUGS = TCG_GAMES.map((game) => game.slug) as GameSlug[];

export function isGameSlug(value: string): value is GameSlug {
  return (GAME_SLUGS as string[]).includes(value);
}
