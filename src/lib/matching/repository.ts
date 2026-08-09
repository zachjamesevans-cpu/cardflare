import "server-only";

import { PRESENCE_WINDOW_MS } from "@/lib/events/participants";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { MAX_OFFERS, type Offer } from "./schema";

/**
 * Reads and writes for offers, service-role after the caller has proved
 * possession of a player session — the same stance as every other guest
 * table, because a guest has no `auth.uid()` for a policy to key off.
 */

export type OfferOutcome =
  | { ok: true }
  | {
      ok: false;
      reason: "not-found" | "own-flare" | "at-cap" | "unavailable";
    };

/**
 * Raises a hand on a Flare.
 *
 * Every rule is re-checked here rather than trusted from the form:
 *
 * - The Flare must be open and in the room the caller proved they are in —
 *   an id harvested from another room's board does nothing.
 * - Not your own Flare.
 *
 * There is deliberately no "must hold the card" check any more. Milestone 7
 * required the card to be in tonight's binder or a synced collection; the
 * founder overturned it — plenty of players know exactly what is in the box
 * at home without ever having typed it in, and on an early board "I got
 * you, I'll bring it" is a promise about tomorrow, not an inventory claim.
 * The offer cap below is what still stops a name landing on every Flare.
 *
 * Offering again is an update to your message and count, never a second
 * row — the unique index this upserts against says so.
 */
export async function offerTrade(
  flareId: string,
  eventId: string,
  responderSessionId: string,
  message: string | null,
  quantity: number = 1,
): Promise<OfferOutcome> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const admin = getSupabaseAdmin();

  const { data: flare, error: flareError } = await admin
    .from("flares")
    .select("id, event_id, player_session_id, card_id, status")
    .eq("id", flareId)
    .maybeSingle();

  if (flareError) {
    console.error("Could not read the Flare for an offer", flareError);
    return { ok: false, reason: "unavailable" };
  }

  if (!flare || flare.event_id !== eventId || flare.status !== "open") {
    return { ok: false, reason: "not-found" };
  }

  if (flare.player_session_id === responderSessionId) {
    return { ok: false, reason: "own-flare" };
  }

  const capped = await atOfferCap(responderSessionId, eventId);
  if (capped === "unknown") return { ok: false, reason: "unavailable" };
  if (capped) return { ok: false, reason: "at-cap" };

  const { error } = await admin.from("flare_responses").upsert(
    {
      flare_id: flareId,
      responder_session_id: responderSessionId,
      message,
      quantity,
    },
    { onConflict: "flare_id,responder_session_id" },
  );

  if (error) {
    console.error("Could not record the offer", error);
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true };
}

/**
 * Whether this player already has their fill of open offers in this room.
 *
 * Counted against *open* Flares in *this* event: withdrawn offers are deleted
 * rows, and offers on cancelled Flares or in last week's room should not eat
 * tonight's allowance.
 */
async function atOfferCap(
  responderSessionId: string,
  eventId: string,
): Promise<boolean | "unknown"> {
  const admin = getSupabaseAdmin();

  const { data: responses, error } = await admin
    .from("flare_responses")
    .select("flare_id")
    .eq("responder_session_id", responderSessionId);

  if (error) {
    console.error("Could not count offers", error);
    return "unknown";
  }

  const flareIds = (responses ?? []).map((row) => row.flare_id);
  if (flareIds.length < MAX_OFFERS) return false;

  const { count, error: countError } = await admin
    .from("flares")
    .select("id", { count: "exact", head: true })
    .in("id", flareIds)
    .eq("event_id", eventId)
    .eq("status", "open");

  if (countError) {
    console.error("Could not count open offers", countError);
    return "unknown";
  }

  return (count ?? 0) >= MAX_OFFERS;
}

/**
 * Takes an offer back. Deleted, not marked: an offer that is no longer open
 * has no history worth keeping, and Milestone 8's trade records will be their
 * own table rather than a lifecycle bolted on here.
 */
export async function withdrawOffer(
  flareId: string,
  responderSessionId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("flare_responses")
    .delete()
    .eq("flare_id", flareId)
    .eq("responder_session_id", responderSessionId);

  if (error) {
    console.error("Could not withdraw the offer", error);
    return false;
  }

  return true;
}

/**
 * Every offer on a room's open Flares.
 *
 * Only from players still in the room: an offer says "come and find me", and
 * somebody who left cannot be found. Leaving the room makes your offers
 * invisible the same way it takes you off the board; rejoining brings them
 * back, since the rows are still there.
 *
 * Separate queries joined here rather than PostgREST embeds, for the same
 * reason as `listParticipants`: the hand-written schema mirror declares no
 * relationships, so an embed silently types as `never`.
 */
export async function listRoomOffers(eventId: string): Promise<Offer[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = getSupabaseAdmin();

  const { data: flares, error: flareError } = await admin
    .from("flares")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "open");

  if (flareError) {
    console.error("Could not read the room's Flares for offers", flareError);
    return [];
  }

  const flareIds = (flares ?? []).map((row) => row.id);
  if (flareIds.length === 0) return [];

  const { data: responses, error: responseError } = await admin
    .from("flare_responses")
    .select("flare_id, responder_session_id, message, quantity, created_at")
    .in("flare_id", flareIds)
    .order("created_at", { ascending: true });

  if (responseError) {
    console.error("Could not read the room's offers", responseError);
    return [];
  }

  const rows = responses ?? [];
  if (rows.length === 0) return [];

  const responderIds = [...new Set(rows.map((row) => row.responder_session_id))];

  const [participants, sessions] = await Promise.all([
    admin
      .from("event_participants")
      .select("player_session_id, last_seen_at")
      .eq("event_id", eventId)
      .in("player_session_id", responderIds),
    admin.from("player_sessions").select("id, display_name").in("id", responderIds),
  ]);

  if (participants.error || sessions.error) {
    console.error(
      "Could not resolve offer responders",
      participants.error ?? sessions.error,
    );
    return [];
  }

  const lastSeen = new Map(
    (participants.data ?? []).map((row) => [row.player_session_id, row.last_seen_at]),
  );
  const names = new Map((sessions.data ?? []).map((row) => [row.id, row.display_name]));

  const now = Date.now();

  return rows
    .filter((row) => lastSeen.has(row.responder_session_id))
    .map((row) => ({
      flareId: row.flare_id,
      responderSessionId: row.responder_session_id,
      displayName: names.get(row.responder_session_id) ?? null,
      message: row.message,
      quantity: row.quantity,
      present:
        now - new Date(lastSeen.get(row.responder_session_id)!).getTime() <=
        PRESENCE_WINDOW_MS,
    }));
}
