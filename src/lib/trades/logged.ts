import "server-only";

import { adjustBinderCard, tradeBinderFor, tradeHoldings } from "@/lib/binder/binder";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { LoggedTradeRow } from "@/lib/supabase/types";
import { tierAllows } from "@/lib/tiers";
import {
  type BinderChange,
  type LogTrade,
  planGave,
  reverseChanges,
} from "./logged-schema";

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
    const changes = await keepHaveListInStep(playerId, displayName, input).catch(
      (caught) => {
        console.error("Could not update the Have list after a logged trade", caught);
        return [] as BinderChange[];
      },
    );
    /* Remembered on the row, so deleting the trade undoes exactly this. */
    if (changes.length > 0) {
      const { error: noteError } = await admin
        .from("logged_trades")
        .update({ binder_changes: changes })
        .eq("id", data.id)
        .eq("player_id", playerId);
      if (noteError) console.error("Could not note the trade's binder moves", noteError);
    }
  }

  return { ok: true, id: data.id };
}

/**
 * The binder nudge, done rather than asked, by exactly the traded
 * copies. A card given away comes off the binders up for trade by the
 * quantity traded (the row leaves only when none are left); a card
 * received is added to the count already there, in the first binder up
 * for trade. Each move is one statement in the database, and the moves
 * actually made are returned for the trade to remember. Best effort:
 * the trade is already written, and a binder that could not be touched
 * is a log line, not a failed log.
 */
async function keepHaveListInStep(
  playerId: string,
  displayName: string,
  input: LogTrade,
): Promise<BinderChange[]> {
  if (input.direction === "got") {
    const binderId = await tradeBinderFor(playerId);
    if (!binderId) return [];
    return applyChanges(playerId, displayName, [
      {
        binder_id: binderId,
        card_id: input.cardId,
        printing_id: input.printingId,
        delta: input.quantity,
      },
    ]);
  }

  const holdings = await tradeHoldings(playerId, input.cardId);
  return applyChanges(
    playerId,
    displayName,
    planGave(holdings, input.cardId, input.printingId, input.quantity),
  );
}

/** Applies binder moves in turn; returns each with the change actually made. */
async function applyChanges(
  playerId: string,
  displayName: string,
  changes: BinderChange[],
): Promise<BinderChange[]> {
  const applied: BinderChange[] = [];
  for (const change of changes) {
    const delta = await adjustBinderCard(playerId, displayName, {
      binderId: change.binder_id,
      cardId: change.card_id,
      printingId: change.printing_id,
      delta: change.delta,
    });
    if (delta !== 0) applied.push({ ...change, delta });
  }
  return applied;
}

/**
 * Removes a logged trade, and undoes what it did to the binders: the
 * copies a "gave" took off go back, the copies a "got" added come off.
 * Exactly those, never more. Only its author's, and a repeat is not an
 * error.
 */
export async function deleteLoggedTrade(
  playerId: string,
  id: string,
  displayName: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const admin = getSupabaseAdmin();

  /* Delete first and read what it did from the deleted row, so two
     deletes at once cannot both put the copies back. */
  const { data: removed, error } = await admin
    .from("logged_trades")
    .delete()
    .eq("id", id)
    .eq("player_id", playerId)
    .select("binder_changes");

  if (error) {
    console.error("Could not remove the logged trade", error);
    return false;
  }

  for (const row of removed ?? []) {
    const changes = Array.isArray(row.binder_changes) ? row.binder_changes : [];
    await applyChanges(playerId, displayName, reverseChanges(changes)).catch(
      (caught) => console.error("Could not undo a logged trade's binder moves", caught),
    );
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
