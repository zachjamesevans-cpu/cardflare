import "server-only";

import {
  SCRYDEX_BASE_URL,
  SCRYDEX_GAMES,
  SCRYDEX_KEY,
} from "@/lib/cards/providers/scrydex/adapter";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { GameSlug } from "@/lib/players/games-catalog";

import { shapePrices, type CardPrices } from "./price-shape";

/**
 * A card's market prices, from Scrydex (see price-shape.ts for the why).
 *
 * Read on demand and cached for twelve hours in Next's data cache:
 * Scrydex updates prices at most daily, a request costs a credit, and a
 * card looked at by a hundred people should cost one. Never stored in
 * the database: a price kept there goes stale silently.
 */
export const PRICE_CACHE_SECONDS = 12 * 60 * 60;

export async function cardPrices(cardId: string): Promise<CardPrices> {
  if (!isSupabaseConfigured()) return { state: "unavailable" };
  const key = process.env.SCRYDEX_API_KEY?.trim();
  const team = process.env.SCRYDEX_TEAM_ID?.trim();
  if (!key || !team) return { state: "unavailable" };

  const admin = getSupabaseAdmin();
  const [{ data: card }, { data: printings }] = await Promise.all([
    admin
      .from("cards")
      .select("game, provider_key, provider_external_id")
      .eq("id", cardId)
      .maybeSingle(),
    admin
      .from("card_printings")
      .select("id, variant_type, provider_key")
      .eq("card_id", cardId),
  ]);

  const segment = card ? SCRYDEX_GAMES[card.game as GameSlug] : undefined;
  if (
    !card ||
    card.provider_key !== SCRYDEX_KEY ||
    !card.provider_external_id ||
    !segment
  ) {
    return { state: "none" };
  }

  /* Variant name -> our printing. A second variant of one name (":2")
     keeps the first: prices are per name on Scrydex's side too. */
  const printingIds = new Map<string, string>();
  for (const row of printings ?? []) {
    if (
      row.provider_key === SCRYDEX_KEY &&
      row.variant_type &&
      !printingIds.has(row.variant_type)
    ) {
      printingIds.set(row.variant_type, row.id);
    }
  }

  try {
    const response = await fetch(
      `${SCRYDEX_BASE_URL}/${segment}/v1/cards/${encodeURIComponent(
        card.provider_external_id,
      )}?include=prices&select=id,variants`,
      {
        headers: { "x-api-key": key, "x-team-id": team, accept: "application/json" },
        next: { revalidate: PRICE_CACHE_SECONDS, tags: [`card-prices:${cardId}`] },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) return { state: "unavailable" };
    const body = (await response.json()) as { data?: { variants?: unknown } };
    const fetchedAt = response.headers.get("date") ?? new Date().toUTCString();
    return shapePrices(
      body.data?.variants,
      printingIds,
      new Date(fetchedAt).toISOString(),
    );
  } catch {
    return { state: "unavailable" };
  }
}
