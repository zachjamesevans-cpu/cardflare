import "server-only";

import { compactCardNumber, normalizeName } from "@/lib/cards/domain";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { CASE_SIZE, normalizeCasePicks, type CasePick } from "@/lib/stores/case-schema";

/**
 * The case: six cards from a store's synced singles, picked by hand.
 *
 * A store's thousand singles are a list nobody reads; the six under the
 * glass by the register are what a player walks over for. The console
 * chooses them, the store page shows them as "In the case this week".
 *
 * Every pick is checked against `store_singles` on the way in, so the
 * case can only ever show a card the counter actually listed - the same
 * promise "your counter may have it" makes on a Flare. No printing, no
 * price: the sync has neither, and the first printing's art stands in
 * exactly as it does on the Feed.
 */

/** Keeps `.in()` lists inside PostgREST's URL limits. */
const CHUNK = 200;

/** The most matches the picker shows for one filter. */
const CATALOG_LIMIT = 12;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface CaseSlot extends CasePick {
  position: number;
}

/**
 * Name, number and first printing's art for a set of cards.
 *
 * The same read the Feed's `cardFacts` makes, kept here so this module
 * does not import the Feed to draw a shelf.
 */
async function cardFactsFor(cardIds: string[]): Promise<Map<string, CasePick>> {
  const facts = new Map<string, CasePick>();
  const ids = [...new Set(cardIds)];
  if (ids.length === 0) return facts;

  const admin = getSupabaseAdmin();

  const [cards, printings] = await Promise.all([
    admin.from("cards").select("id, exact_name, canonical_card_number").in("id", ids),
    admin.from("card_printings").select("card_id, image_url").in("card_id", ids),
  ]);

  const art = new Map<string, string>();
  for (const row of printings.data ?? []) {
    if (row.image_url && !art.has(row.card_id)) art.set(row.card_id, row.image_url);
  }

  for (const row of cards.data ?? []) {
    facts.set(row.id, {
      cardId: row.id,
      cardName: row.exact_name,
      cardNumber: row.canonical_card_number,
      imageUrl: art.get(row.id) ?? null,
    });
  }

  return facts;
}

/** The case as the store set it, in slot order, up to six. */
export async function caseFor(storeId: string): Promise<CaseSlot[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("store_case_picks")
    .select("position, card_id")
    .eq("store_id", storeId)
    .order("position")
    .limit(CASE_SIZE);

  if (error) {
    console.error("Could not read the case", error);
    return [];
  }

  const rows = data ?? [];
  const facts = await cardFactsFor(rows.map((row) => row.card_id));

  return rows.flatMap((row) => {
    const card = facts.get(row.card_id);
    return card ? [{ position: row.position, ...card }] : [];
  });
}

/** Every card id the store's counter listed in its last sync. */
async function stockedCardIds(storeId: string): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("store_singles")
    .select("card_id")
    .eq("store_id", storeId);

  if (error) {
    console.error("Could not read the store's singles", error);
    return [];
  }

  return (data ?? []).map((row) => row.card_id);
}

/** Whether the store has any singles synced at all. */
export async function hasSingles(storeId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { count, error } = await getSupabaseAdmin()
    .from("store_singles")
    .select("card_id", { count: "exact", head: true })
    .eq("store_id", storeId);

  if (error) {
    console.error("Could not count the store's singles", error);
    return false;
  }

  return (count ?? 0) > 0;
}

/**
 * PostgREST's `.or()` filter is a comma-separated list of expressions,
 * so a filter value that carries a comma, a parenthesis or a wildcard
 * would be read as syntax. The name side is already letters, digits and
 * spaces after `normalizeName`; the number side is letters and digits
 * after `compactCardNumber`. Nothing else gets through.
 */
function filterFor(query: string): string | null {
  const name = normalizeName(query);
  const number = compactCardNumber(query);
  const parts: string[] = [];
  if (name) parts.push(`normalized_name.ilike.%${name}%`);
  if (number) parts.push(`compact_card_number.ilike.${number}%`);
  return parts.length > 0 ? parts.join(",") : null;
}

/**
 * The store's own singles that match a name or a number, up to twelve.
 *
 * Filtered over the store's stock rather than over the catalogue: a
 * search for "Luffy" that returned two hundred Luffys the shop does not
 * have would be the whole catalogue with a store's name on it. So the
 * stocked ids are read first and the text filter runs inside them.
 */
export async function singlesCatalog(
  storeId: string,
  query: string,
): Promise<CasePick[]> {
  if (!isSupabaseConfigured()) return [];

  const filter = filterFor(query);
  if (!filter) return [];

  const stocked = await stockedCardIds(storeId);
  if (stocked.length === 0) return [];

  const admin = getSupabaseAdmin();
  const found: { id: string; exact_name: string; canonical_card_number: string }[] = [];

  for (const batch of chunks(stocked, CHUNK)) {
    const { data, error } = await admin
      .from("cards")
      .select("id, exact_name, canonical_card_number")
      .in("id", batch)
      .or(filter)
      .order("exact_name")
      .limit(CATALOG_LIMIT - found.length);

    if (error) {
      console.error("Could not search the store's singles", error);
      break;
    }

    found.push(...(data ?? []));
    if (found.length >= CATALOG_LIMIT) break;
  }

  const art = await cardFactsFor(found.map((row) => row.id));

  return found.map((row) => ({
    cardId: row.id,
    cardName: row.exact_name,
    cardNumber: row.canonical_card_number,
    imageUrl: art.get(row.id)?.imageUrl ?? null,
  }));
}

/**
 * Replaces the case with these cards, in this order.
 *
 * Deduped and capped at six, and EVERY id is checked against the
 * store's singles before anything is written: a card the counter never
 * listed is refused, whoever posted it. Delete-then-insert rather than
 * a diff, the same shape as the singles sync - the form carries the
 * whole case, so the whole case is what gets written.
 */
export async function setCasePicks(
  storeId: string,
  cardIds: string[],
): Promise<{ ok: true } | { ok: false; reason: "not-stocked" | "failed" }> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "failed" };

  const picks = normalizeCasePicks(cardIds);
  const admin = getSupabaseAdmin();

  if (picks.length > 0) {
    const { data, error } = await admin
      .from("store_singles")
      .select("card_id")
      .eq("store_id", storeId)
      .in("card_id", picks);

    if (error) {
      console.error("Could not check the case against the singles", error);
      return { ok: false, reason: "failed" };
    }

    const stocked = new Set((data ?? []).map((row) => row.card_id));
    if (picks.some((cardId) => !stocked.has(cardId))) {
      return { ok: false, reason: "not-stocked" };
    }
  }

  const { error: clearError } = await admin
    .from("store_case_picks")
    .delete()
    .eq("store_id", storeId);

  if (clearError) {
    console.error("Could not clear the case", clearError);
    return { ok: false, reason: "failed" };
  }

  if (picks.length === 0) return { ok: true };

  const { error } = await admin.from("store_case_picks").insert(
    picks.map((cardId, position) => ({
      store_id: storeId,
      position,
      card_id: cardId,
    })),
  );

  if (error) {
    console.error("Could not write the case", error);
    return { ok: false, reason: "failed" };
  }

  return { ok: true };
}
