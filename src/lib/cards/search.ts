import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { CardSearchRow } from "@/lib/supabase/types";
import type { CardPrinting, CardResult } from "./schema";

export const SEARCH_LIMIT = 20;

/**
 * Ranked card search.
 *
 * Calls the `search_cards` SQL function rather than composing filters, because
 * the ranking is the feature — trigram similarity is what makes a misspelling
 * find the right card, and it cannot be expressed through PostgREST.
 *
 * Service role: the card tables are sealed. Authorisation is not the point
 * here (card data is public reference material) — routing through the server
 * is, because that is where the rate limit lives.
 */
export async function searchCards(query: string): Promise<CardResult[]> {
  if (!isSupabaseConfigured()) {
    console.error("Card search rejected: Supabase is not configured.");
    return [];
  }

  const admin = getSupabaseAdmin();

  const { data, error } = await admin.rpc("search_cards", {
    search_query: query,
    result_limit: SEARCH_LIMIT,
  });

  if (error) {
    console.error("Card search failed", error);
    return [];
  }

  const rows = (data ?? []) as CardSearchRow[];
  if (rows.length === 0) return [];

  const printings = await printingsFor(rows.map((row) => row.id));

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    colors: row.colors,
    types: row.types,
    cost: row.cost,
    power: row.power,
    counter: row.counter,
    life: row.life,
    attribute: row.attribute,
    printings: printings.get(row.id) ?? [],
  }));
}

/**
 * Fetches printings for the whole result page in one query.
 *
 * Twenty results would otherwise be twenty round trips, which is the
 * difference between search feeling instant and feeling broken on store wifi.
 */
async function printingsFor(cardIds: string[]): Promise<Map<string, CardPrinting[]>> {
  const { data, error } = await getSupabaseAdmin()
    .from("card_printings")
    .select("card_id, set_code, rarity, variant, image_url")
    .in("card_id", cardIds)
    .order("set_code");

  const grouped = new Map<string, CardPrinting[]>();

  if (error) {
    // A card without its printings is still findable, which is the job.
    console.error("Could not load card printings", error);
    return grouped;
  }

  for (const row of data ?? []) {
    const list = grouped.get(row.card_id) ?? [];
    list.push({
      setCode: row.set_code,
      rarity: row.rarity,
      variant: row.variant,
      imageUrl: row.image_url,
    });
    grouped.set(row.card_id, list);
  }

  return grouped;
}

/**
 * How many cards are loaded.
 *
 * Exists so an empty pool can be told from a query that matched nothing. Those
 * are the same screen to a player and completely different problems: one is a
 * typo, the other is that nobody has run an import yet. Reporting the second
 * as the first is how a setup task stays invisible — the same mistake the
 * email configuration made.
 */
export async function countCards(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;

  const { count, error } = await getSupabaseAdmin()
    .from("cards")
    .select("id", { count: "exact", head: true });

  if (error) {
    console.error("Could not count cards", error);
    return 0;
  }

  return count ?? 0;
}
