import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { PlayerCollectionSyncRow } from "@/lib/supabase/types";

/**
 * A player's imported collection (Collectr export), aggregated per card.
 *
 * Private by design, twice over: RLS locks the tables to the service role,
 * and no code path anywhere renders the collection as a list. The only
 * things a collection ever does are (a) flag Flares its owner can answer
 * and (b) authorize their offers — both of which reveal a card only when
 * the owner chooses to put their name on it.
 */

/** Keeps `.in()` lists inside PostgREST's URL limits. */
const CHUNK = 200;

const INSERT_CHUNK = 500;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** One aggregated import row: a card, optionally pinned to a printing. */
export interface CollectionEntry {
  cardId: string;
  /** Null when the file's product name proved no particular printing. */
  printingId: string | null;
  quantity: number;
}

/**
 * Replaces the player's collection with a fresh import, and records it.
 *
 * Delete-then-insert, same reasoning as the store singles sync: the export
 * is the whole truth of the collection, and a diff against stale rows can
 * only preserve mistakes. If an insert fails midway the sync record is not
 * written and the next upload replaces everything again.
 */
export async function replaceCollection(
  playerId: string,
  entries: CollectionEntry[],
  stats: { linesSeen: number; cardsMatched: number; linesUnmatched: number },
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const admin = getSupabaseAdmin();

  const { error: clearError } = await admin
    .from("player_collection")
    .delete()
    .eq("player_id", playerId);

  if (clearError) {
    console.error("Could not clear the previous collection", clearError);
    return false;
  }

  const rows = entries.map((entry) => ({
    player_id: playerId,
    card_id: entry.cardId,
    printing_id: entry.printingId,
    quantity: entry.quantity,
  }));

  for (const batch of chunks(rows, INSERT_CHUNK)) {
    const { error } = await admin.from("player_collection").insert(batch);
    if (error) {
      console.error("Could not write the collection", error);
      return false;
    }
  }

  const { error: syncError } = await admin.from("player_collection_syncs").upsert(
    {
      player_id: playerId,
      synced_at: new Date().toISOString(),
      lines_seen: stats.linesSeen,
      cards_matched: stats.cardsMatched,
      lines_unmatched: stats.linesUnmatched,
    },
    { onConflict: "player_id" },
  );

  if (syncError) {
    console.error("Could not record the collection sync", syncError);
    return false;
  }

  return true;
}

/** The player's latest import, for the account page's stat line. */
export async function collectionSyncFor(
  playerId: string,
): Promise<PlayerCollectionSyncRow | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("player_collection_syncs")
    .select("*")
    .eq("player_id", playerId)
    .maybeSingle();

  if (error) {
    console.error("Could not read the collection sync record", error);
    return null;
  }

  return data;
}

/**
 * Which of these cards the player's collection holds, and with which
 * proven printings.
 *
 * Queried the narrow way round — the board's cards against one player's
 * rows — so a room render costs a bounded lookup however large the
 * collection is. The shape is the matcher's own: a card key means "have
 * it", and its set holds only the printings the import actually proved,
 * so a Flare naming a printing matches exactly when the file named it too
 * and honestly downgrades when it did not.
 */
export async function collectionAvailability(
  playerId: string,
  cardIds: string[],
): Promise<Map<string, Set<string>>> {
  const held = new Map<string, Set<string>>();
  if (cardIds.length === 0 || !isSupabaseConfigured()) return held;

  const admin = getSupabaseAdmin();

  for (const batch of chunks([...new Set(cardIds)], CHUNK)) {
    const { data, error } = await admin
      .from("player_collection")
      .select("card_id, printing_id")
      .eq("player_id", playerId)
      .in("card_id", batch);

    if (error) {
      console.error("Could not check the collection", error);
      return new Map();
    }

    for (const row of data ?? []) {
      const printings = held.get(row.card_id) ?? new Set<string>();
      if (row.printing_id) printings.add(row.printing_id);
      held.set(row.card_id, printings);
    }
  }

  return held;
}

/**
 * The provider's names for every printing of these cards, for resolving
 * a file's product names at import time. Chunked like every board-sized
 * lookup here.
 */
export async function printingNamesByCard(
  cardIds: string[],
): Promise<Map<string, { id: string; printingName: string | null }[]>> {
  const byCard = new Map<string, { id: string; printingName: string | null }[]>();
  if (cardIds.length === 0 || !isSupabaseConfigured()) return byCard;

  const admin = getSupabaseAdmin();

  for (const batch of chunks([...new Set(cardIds)], CHUNK)) {
    const { data, error } = await admin
      .from("card_printings")
      .select("id, card_id, printing_name")
      .in("card_id", batch);

    if (error) {
      console.error("Could not load printing names for the import", error);
      return new Map();
    }

    for (const row of data ?? []) {
      const list = byCard.get(row.card_id) ?? [];
      list.push({ id: row.id, printingName: row.printing_name });
      byCard.set(row.card_id, list);
    }
  }

  return byCard;
}

/**
 * Whether the session's account holds this card in its imported collection.
 *
 * The offer path's second chance: a binder entry proves you carry the card
 * tonight, and an imported collection is the same claim made once at import
 * time. Guests resolve to no player and the answer stays no.
 */
export async function sessionCollectionHolds(
  playerSessionId: string,
  cardId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const admin = getSupabaseAdmin();

  const { data: session, error } = await admin
    .from("player_sessions")
    .select("player_id")
    .eq("id", playerSessionId)
    .maybeSingle();

  if (error) {
    console.error("Could not resolve the session's account", error);
    return false;
  }

  if (!session?.player_id) return false;

  const { data, error: heldError } = await admin
    .from("player_collection")
    .select("id")
    .eq("player_id", session.player_id)
    .eq("card_id", cardId)
    .limit(1);

  if (heldError) {
    console.error("Could not check the collection for the offer", heldError);
    return false;
  }

  return (data ?? []).length > 0;
}
