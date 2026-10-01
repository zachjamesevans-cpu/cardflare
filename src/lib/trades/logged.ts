import "server-only";

import { binderSessionFor, listHaves } from "@/lib/lists/haves";
import { addToBinder, removeFromBinder } from "@/lib/lists/repository";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { LoggedTradeRow } from "@/lib/supabase/types";
import { tierAllows } from "@/lib/tiers";
import type { LogTrade } from "./logged-schema";

/**
 * Trades the player logged by hand: written, read back, and removed.
 *
 * Reading the history is Pro, so writing to it is too — a free player
 * cannot see the row they would be adding. The gate is the same flag
 * the list reads, so flipping one flips both.
 *
 * Everything here is the player's own word. No Embers are paid, no
 * partner is asked to confirm, and nobody else ever reads a row.
 */

export type LogFailure = "unavailable" | "locked" | "no-card" | "yourself";

export async function logTrade(
  playerId: string,
  displayName: string,
  tier: string | null,
  input: LogTrade,
): Promise<{ ok: true; id: string } | { ok: false; reason: LogFailure }> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  if (!tierAllows(tier, "tradeHistory")) return { ok: false, reason: "locked" };
  if (input.partnerPlayerId === playerId) return { ok: false, reason: "yourself" };

  const admin = getSupabaseAdmin();

  const { data: card } = await admin
    .from("cards")
    .select("id")
    .eq("id", input.cardId)
    .maybeSingle();
  if (!card) return { ok: false, reason: "no-card" };

  /* A partner id that names nobody is dropped rather than refused: the
     trade still happened, and the typed name (if any) still stands. */
  let partnerPlayerId = input.partnerPlayerId;
  if (partnerPlayerId) {
    const { data: partner } = await admin
      .from("players")
      .select("id")
      .eq("id", partnerPlayerId)
      .maybeSingle();
    if (!partner) partnerPlayerId = null;
  }

  const { data, error } = await admin
    .from("logged_trades")
    .insert({
      player_id: playerId,
      card_id: input.cardId,
      printing_id: input.printingId,
      quantity: input.quantity,
      direction: input.direction,
      partner_player_id: partnerPlayerId,
      partner_name: input.partnerName,
      place: input.place,
      traded_on: input.tradedOn,
      note: input.note,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("Could not log the trade", error);
    return { ok: false, reason: "unavailable" };
  }

  if (input.updateHaveList) {
    await keepHaveListInStep(playerId, displayName, input).catch((caught) =>
      console.error("Could not update the Have list after a logged trade", caught),
    );
  }

  return { ok: true, id: data.id };
}

/**
 * The binder nudge, done rather than asked. A card given away comes
 * off the Have list (every entry for that card, or for that printing
 * when one was named); a card received goes on it. Best effort: the
 * trade is already written, and a binder that could not be touched is
 * a log line, not a failed log.
 */
async function keepHaveListInStep(
  playerId: string,
  displayName: string,
  input: LogTrade,
): Promise<void> {
  if (input.direction === "got") {
    const session = await binderSessionFor(playerId, displayName, true);
    if (!session) return;
    await addToBinder(session.id, {
      cardId: input.cardId,
      printingId: input.printingId,
      quantity: input.quantity,
      note: null,
      deckLabel: null,
    });
    return;
  }

  const session = await binderSessionFor(playerId, displayName, false);
  if (!session) return;
  const haves = await listHaves(playerId);
  for (const entry of haves) {
    if (entry.cardId !== input.cardId) continue;
    if (input.printingId && entry.printingId && entry.printingId !== input.printingId) {
      continue;
    }
    await removeFromBinder(entry.id, session.id);
  }
}

/** Removes a logged trade. Only its author's, and a repeat is not an error. */
export async function deleteLoggedTrade(
  playerId: string,
  id: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("logged_trades")
    .delete()
    .eq("id", id)
    .eq("player_id", playerId);

  if (error) {
    console.error("Could not remove the logged trade", error);
    return false;
  }
  return true;
}

export async function listLoggedTrades(playerId: string): Promise<LoggedTradeRow[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("logged_trades")
    .select(
      "id, created_at, player_id, card_id, printing_id, quantity, direction, partner_player_id, partner_name, place, traded_on, note",
    )
    .eq("player_id", playerId)
    .order("traded_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    console.error("Could not read the logged trades", error);
    return [];
  }
  return (data ?? []) as LoggedTradeRow[];
}
