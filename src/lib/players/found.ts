import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { FlareIntent } from "@/lib/supabase/types";

/**
 * "I have found this card": one rule, said once, heard everywhere.
 *
 * The founder: "should be able to remove cards from flares and it's all
 * global - updates everywhere as found." A post stays up when a card
 * comes off the Flare screen, so the thread and the hearts survive and
 * the post keeps telling people what somebody is building; the card
 * itself goes grey with the tick, on every surface that draws it.
 *
 * Done is a COUNT, not a status. A card is done when its copies found
 * reach its copies wanted, which is the number the hunt page, the
 * profile panel, the Feed and the post page already read. So marking a
 * card found writes that number, on every open Flare this player has
 * for the card - posted from the area or onto any board - and on every
 * hunt request those Flares answer. Nothing is cancelled and nothing is
 * deleted; the readers do the rest.
 *
 * Each door that means "I have this now" calls in here: Remove on a
 * saved request, minus down to none, Remove on a board's own list,
 * and Remove on the Have list for an offer ("Gone" rather than
 * "Found", same rule).
 */

interface OpenFlare {
  id: string;
  quantity: number;
  hunt_request_id: string | null;
}

async function openFlaresOf(
  playerId: string,
  cardId: string,
  intent: FlareIntent,
): Promise<OpenFlare[]> {
  const admin = getSupabaseAdmin();
  const { data: sessions } = await admin
    .from("player_sessions")
    .select("id")
    .eq("player_id", playerId);
  const sessionIds = (sessions ?? []).map((row) => row.id);

  let query = admin
    .from("flares")
    .select("id, quantity, hunt_request_id")
    .eq("status", "open")
    .eq("intent", intent)
    .eq("card_id", cardId);
  query =
    sessionIds.length > 0
      ? query.or(
          `player_id.eq.${playerId},player_session_id.in.(${sessionIds.join(",")})`,
        )
      : query.eq("player_id", playerId);

  const { data, error } = await query;
  if (error) {
    console.error("Could not read the player's Flares for a card", error);
    return [];
  }
  return data ?? [];
}

/** Every copy of this card found, on every Flare and hunt of the player's. */
export async function markCardFound(
  playerId: string,
  cardId: string,
  intent: FlareIntent = "want",
): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const admin = getSupabaseAdmin();
  const flares = await openFlaresOf(playerId, cardId, intent);
  if (flares.length === 0) return 0;

  const now = new Date().toISOString();
  await Promise.all(
    flares.map((flare) =>
      admin
        .from("flares")
        .update({ found_quantity: flare.quantity, found_at: now, updated_at: now })
        .eq("id", flare.id),
    ),
  );

  const requestIds = [
    ...new Set(
      flares.flatMap((flare) => (flare.hunt_request_id ? [flare.hunt_request_id] : [])),
    ),
  ];
  if (requestIds.length > 0) {
    const { data: requests } = await admin
      .from("hunt_requests")
      .select("id, quantity_needed")
      .in("id", requestIds);
    await Promise.all(
      (requests ?? []).map((request) =>
        admin
          .from("hunt_requests")
          .update({ quantity_found: request.quantity_needed, updated_at: now })
          .eq("id", request.id),
      ),
    );
  }

  return flares.length;
}

/**
 * The copies wanted, changed on the Flare screen, followed by every
 * open Flare and hunt request for the card. Down to what is already
 * found and the card reads as found; up again and the tick comes off.
 */
export async function syncCardQuantity(
  playerId: string,
  cardId: string,
  quantity: number,
  intent: FlareIntent = "want",
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const admin = getSupabaseAdmin();
  const wanted = Math.min(99, Math.max(1, Math.round(quantity)));
  const flares = await openFlaresOf(playerId, cardId, intent);
  if (flares.length === 0) return;

  const now = new Date().toISOString();
  await Promise.all(
    flares.map((flare) =>
      admin
        .from("flares")
        .update({ quantity: wanted, updated_at: now })
        .eq("id", flare.id),
    ),
  );
  const requestIds = [
    ...new Set(
      flares.flatMap((flare) => (flare.hunt_request_id ? [flare.hunt_request_id] : [])),
    ),
  ];
  if (requestIds.length > 0) {
    await admin
      .from("hunt_requests")
      .update({ quantity_needed: wanted, updated_at: now })
      .in("id", requestIds);
  }
}
