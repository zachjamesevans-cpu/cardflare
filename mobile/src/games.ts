/**
 * The games CardFlare knows about - the app's copy of the website's
 * `src/lib/players/games-catalog.ts`, kept identical on purpose. Slugs
 * are what the server stores; labels are what the picker shows.
 */

export const TCG_GAMES = [
  { slug: "one-piece", label: "One Piece TCG" },
  { slug: "riftbound", label: "Riftbound" },
  { slug: "lorcana", label: "Lorcana" },
  { slug: "mtg", label: "Magic: The Gathering" },
  { slug: "pokemon", label: "Pokémon" },
] as const;

export type GameSlug = (typeof TCG_GAMES)[number]["slug"];
