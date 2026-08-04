import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { StoreSinglesSyncRow } from "@/lib/supabase/types";

/** Keeps `.in()` lists inside PostgREST's URL limits. */
const CHUNK = 200;

/** Insert batch size; a full catalog's worth of rows is a handful of calls. */
const INSERT_CHUNK = 500;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Resolves compact card numbers to card ids.
 *
 * The one matching rule: a row matches if its number is in the catalog,
 * exactly. No fuzzy name matching — a wrong guess would tell a player the
 * counter has a card the store never listed.
 */
export async function cardsByCompactNumbers(
  numbers: string[],
): Promise<Map<string, string>> {
  if (numbers.length === 0 || !isSupabaseConfigured()) return new Map();

  const admin = getSupabaseAdmin();
  const found = new Map<string, string>();

  for (const batch of chunks(numbers, CHUNK)) {
    const { data, error } = await admin
      .from("cards")
      .select("id, compact_card_number")
      .in("compact_card_number", batch);

    if (error) {
      console.error("Could not look up cards by number", error);
      return new Map();
    }

    for (const row of data ?? []) {
      found.set(row.compact_card_number, row.id);
    }
  }

  return found;
}

/**
 * Replaces a store's synced singles with a fresh set, and records the sync.
 *
 * Delete-then-insert rather than diffing: the export is the whole truth of
 * the counter, and a diff against stale rows can only preserve mistakes.
 * PostgREST offers no transaction across the two steps; if an insert fails
 * midway the sync record is not written, the store sees the error, and the
 * next upload replaces everything again — the failure mode is a missing
 * sync, never a silently wrong one.
 */
export async function replaceSingles(
  storeId: string,
  totalsByCard: Map<string, number>,
  stats: { linesSeen: number; cardsMatched: number; linesUnmatched: number },
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const admin = getSupabaseAdmin();

  const { error: clearError } = await admin
    .from("store_singles")
    .delete()
    .eq("store_id", storeId);

  if (clearError) {
    console.error("Could not clear the previous sync", clearError);
    return false;
  }

  const rows = [...totalsByCard.entries()].map(([cardId, quantity]) => ({
    store_id: storeId,
    card_id: cardId,
    quantity,
  }));

  for (const batch of chunks(rows, INSERT_CHUNK)) {
    const { error } = await admin.from("store_singles").insert(batch);
    if (error) {
      console.error("Could not write the synced singles", error);
      return false;
    }
  }

  const { error: syncError } = await admin.from("store_singles_syncs").upsert(
    {
      store_id: storeId,
      synced_at: new Date().toISOString(),
      lines_seen: stats.linesSeen,
      cards_matched: stats.cardsMatched,
      lines_unmatched: stats.linesUnmatched,
    },
    { onConflict: "store_id" },
  );

  if (syncError) {
    console.error("Could not record the sync", syncError);
    return false;
  }

  return true;
}

/** The store's latest sync, for the dashboard's stat card. */
export async function singlesSyncFor(
  storeId: string,
): Promise<StoreSinglesSyncRow | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("store_singles_syncs")
    .select("*")
    .eq("store_id", storeId)
    .maybeSingle();

  if (error) {
    console.error("Could not read the sync record", error);
    return null;
  }

  return data;
}

/**
 * Which of these cards the store's counter may have.
 *
 * The room's question, asked per render: the Flares on the board against
 * one store's synced stock. Returns a set of card ids — quantities stay
 * server-side, because "may have it, ask at the counter" is the whole
 * promise a day-old sync can honestly make.
 */
export async function counterAvailability(
  storeId: string,
  cardIds: string[],
): Promise<Set<string>> {
  if (cardIds.length === 0 || !isSupabaseConfigured()) return new Set();

  const admin = getSupabaseAdmin();
  const available = new Set<string>();

  for (const batch of chunks([...new Set(cardIds)], CHUNK)) {
    const { data, error } = await admin
      .from("store_singles")
      .select("card_id")
      .eq("store_id", storeId)
      .in("card_id", batch);

    if (error) {
      console.error("Could not check the counter's stock", error);
      return new Set();
    }

    for (const row of data ?? []) available.add(row.card_id);
  }

  return available;
}
