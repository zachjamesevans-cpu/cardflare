import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { CardPrinting, CardResult } from "./schema";

export const SEARCH_LIMIT = 20;

/** Optional narrowing. These filter a search; they never identify a card. */
export interface CardSearchFilters {
  setCode?: string | null;
  cardType?: string | null;
  color?: string | null;
}

interface SearchRow {
  id: string;
  canonical_card_number: string;
  exact_name: string;
  card_type: string | null;
  colors: string[];
  traits: string[];
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  rarity: string | null;
  effect_text: string | null;
  trigger_text: string | null;
  score: number;
}

/**
 * Ranked search over the local catalog.
 *
 * Never touches the provider. The runtime path is Supabase only — a free API
 * must not be queried on every keystroke, and a mid-event dependency on
 * someone else's uptime is the same mistake as hot-linking their images.
 *
 * Calls `search_cards` rather than composing filters, because the ranking is
 * the feature and trigram similarity cannot be expressed through PostgREST.
 */
export async function searchCards(
  query: string,
  filters: CardSearchFilters = {},
): Promise<CardResult[]> {
  if (!isSupabaseConfigured()) {
    console.error("Card search rejected: Supabase is not configured.");
    return [];
  }

  const admin = getSupabaseAdmin();

  const { data, error } = await admin.rpc("search_cards", {
    search_query: query,
    result_limit: SEARCH_LIMIT,
    filter_set_code: filters.setCode ?? null,
    filter_card_type: filters.cardType ?? null,
    filter_color: filters.color ?? null,
  });

  if (error) {
    console.error("Card search failed", error);
    return [];
  }

  const rows = (data ?? []) as unknown as SearchRow[];
  if (rows.length === 0) return [];

  const printings = await printingsFor(rows.map((row) => row.id));

  return rows.map((row) => ({
    id: row.id,
    exactName: row.exact_name,
    canonicalCardNumber: row.canonical_card_number,
    cardType: row.card_type,
    colors: row.colors ?? [],
    traits: row.traits ?? [],
    cost: row.cost,
    power: row.power,
    counter: row.counter,
    life: row.life,
    rarity: row.rarity,
    effectText: row.effect_text,
    triggerText: row.trigger_text,
    printings: printings.get(row.id) ?? [],
  }));
}

/**
 * Loads printings for the whole result page in one query.
 *
 * Twenty results would otherwise be twenty round trips, which is the
 * difference between search feeling instant and feeling broken on store wifi.
 */
async function printingsFor(cardIds: string[]): Promise<Map<string, CardPrinting[]>> {
  const grouped = new Map<string, CardPrinting[]>();

  const { data, error } = await getSupabaseAdmin()
    .from("card_printings")
    .select("card_id, set_code, set_name, printing_label, variant_type, image_url")
    .in("card_id", cardIds)
    .order("set_code");

  if (error) {
    // A card without its printings is still findable, which is the job.
    console.error("Could not load card printings", error);
    return grouped;
  }

  for (const row of data ?? []) {
    const list = grouped.get(row.card_id) ?? [];
    list.push({
      setCode: row.set_code,
      setName: row.set_name,
      printingLabel: row.printing_label,
      variantType: row.variant_type,
      imageUrl: row.image_url,
    });
    grouped.set(row.card_id, list);
  }

  return grouped;
}

/**
 * How many printings exist, and how many carry a provider image URL.
 *
 * "Why are there no pictures" has three unrelated answers — the display flag
 * is off, the provider returned no URL, or the URL is on a host that is not
 * allow-listed — and from the outside they look identical. This separates the
 * first two, which is the difference between changing a setting and changing
 * the provider.
 */
export async function countPrintingImages(): Promise<{
  total: number;
  withImage: number;
}> {
  if (!isSupabaseConfigured()) return { total: 0, withImage: 0 };

  const admin = getSupabaseAdmin();
  const base = () =>
    admin.from("card_printings").select("id", { count: "exact", head: true });

  const [all, withUrl] = await Promise.all([
    base(),
    base().not("image_url", "is", null),
  ]);

  if (all.error || withUrl.error) {
    console.error("Could not count printing images", all.error ?? withUrl.error);
    return { total: 0, withImage: 0 };
  }

  return { total: all.count ?? 0, withImage: withUrl.count ?? 0 };
}

/**
 * How many cards are loaded.
 *
 * Exists so an empty pool can be told from a query that matched nothing.
 * Those are the same screen to a player and completely different problems.
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
