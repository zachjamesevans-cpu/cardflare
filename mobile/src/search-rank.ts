/**
 * How search orders what it found: the same in the app and on the
 * website. This is src/lib/search/rank.ts, word for word, and
 * tests/unit/search-rank.test.ts walks both.
 *
 * The founder: "When I search for someone named Luffy as a username, a
 * bunch of Luffy cards pop up, with the username being all the way at
 * the bottom." So search has tabs, Top · Players · Cards · Stores, and
 * Top is ordered by how well each thing matches: a player or store whose
 * name IS the search, or starts with it, comes before the cards, which
 * are many and mostly partial matches. "@" at the front means players
 * only.
 */

export type SearchTab = "top" | "players" | "cards" | "stores";

export const SEARCH_TABS: { id: SearchTab; label: string }[] = [
  { id: "top", label: "Top" },
  { id: "players", label: "Players" },
  { id: "cards", label: "Cards" },
  { id: "stores", label: "Stores" },
];

/** How many of each Top shows before "See all". */
export const TOP_LIMITS = { players: 3, stores: 2, cards: 6 } as const;

/** What the box holds, with "@" read as "players only". */
export function readQuery(raw: string): { text: string; playersOnly: boolean } {
  const trimmed = raw.trim();
  if (trimmed.startsWith("@"))
    return { text: trimmed.slice(1).trim(), playersOnly: true };
  return { text: trimmed, playersOnly: false };
}

function fold(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * How well `query` matches any of `names`: 4 exact, 3 starts with, 2 a
 * word starts with, 1 contains, 0 not at all.
 */
export function matchScore(
  query: string,
  names: readonly (string | null | undefined)[],
): number {
  const q = fold(query);
  if (!q) return 0;
  let best = 0;
  for (const name of names) {
    if (!name) continue;
    const n = fold(name);
    if (!n) continue;
    if (n === q) return 4;
    if (n.startsWith(q)) best = Math.max(best, 3);
    else if (n.split(" ").some((word) => word.startsWith(q))) best = Math.max(best, 2);
    else if (n.includes(q)) best = Math.max(best, 1);
  }
  return best;
}

/** Best match first; equal matches keep the server's order. */
export function rankBy<T>(items: readonly T[], score: (item: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index, score: score(item) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item);
}

export type TopSection = "players" | "stores" | "cards";

/**
 * The order Top draws its sections in: a strong player or store match
 * (exact or starts-with) goes above the cards; otherwise the cards lead.
 */
export function topOrder(bestPlayer: number, bestStore: number): TopSection[] {
  const strong = (score: number) => score >= 3;
  const order: TopSection[] = [];
  if (strong(bestPlayer)) order.push("players");
  if (strong(bestStore)) order.push("stores");
  order.push("cards");
  if (!strong(bestPlayer)) order.push("players");
  if (!strong(bestStore)) order.push("stores");
  return order;
}
