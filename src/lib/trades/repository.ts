import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { TradeRecord } from "./schema";

/**
 * Writes and reads for trades, service-role behind a proved session or an
 * authorised store viewer — the same stance as every guest table.
 */

/** Postgres unique violation: this Flare already has its trade. */
const UNIQUE_VIOLATION = "23505";

export type ConfirmOutcome =
  { ok: true } | { ok: false; reason: "not-found" | "no-offer" | "unavailable" };

/**
 * Records that a Flare's trade happened, and closes the Flare.
 *
 * Only the Flare's author can confirm — a Flare that is not yours reads as
 * not found, so the action cannot be used to probe which ids exist. When a
 * partner is named they must have a standing offer on that Flare: the offer
 * row is the proof they said "I have this", and without that requirement
 * confirming would let one player write another's name into history
 * arbitrarily. A trade with somebody who never tapped "offer" is recorded
 * with no partner — still a tally mark, just an anonymous one.
 *
 * Two writes, deliberately ordered: the trade row first, the Flare's close
 * second. If the close fails the retry re-runs both, and the one-trade-per-
 * Flare index turns the duplicate insert into "already recorded" — so a
 * half-completed confirm can only ever under-close, never double-count.
 */
export async function confirmTrade(
  flareId: string,
  eventId: string,
  requesterSessionId: string,
  partnerSessionId: string | null,
): Promise<ConfirmOutcome> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const admin = getSupabaseAdmin();

  const { data: flare, error: flareError } = await admin
    .from("flares")
    .select("id, event_id, player_session_id, card_id, printing_id, quantity, status")
    .eq("id", flareId)
    .maybeSingle();

  if (flareError) {
    console.error("Could not read the Flare for a trade", flareError);
    return { ok: false, reason: "unavailable" };
  }

  if (
    !flare ||
    flare.event_id !== eventId ||
    flare.status !== "open" ||
    flare.player_session_id !== requesterSessionId
  ) {
    return { ok: false, reason: "not-found" };
  }

  if (partnerSessionId) {
    if (partnerSessionId === requesterSessionId) {
      return { ok: false, reason: "no-offer" };
    }

    const { data: offer, error: offerError } = await admin
      .from("flare_responses")
      .select("flare_id")
      .eq("flare_id", flareId)
      .eq("responder_session_id", partnerSessionId)
      .maybeSingle();

    if (offerError) {
      console.error("Could not check the partner's offer", offerError);
      return { ok: false, reason: "unavailable" };
    }

    if (!offer) return { ok: false, reason: "no-offer" };
  }

  const { error: insertError } = await admin.from("trades").insert({
    event_id: eventId,
    flare_id: flareId,
    requester_session_id: requesterSessionId,
    holder_session_id: partnerSessionId,
    card_id: flare.card_id,
    printing_id: flare.printing_id,
    quantity: flare.quantity,
  });

  /*
   * A duplicate is a retry of a confirm whose close never landed — the
   * partial unique index cannot be named through supabase-js's `onConflict`,
   * so idempotency is the error code instead. Fall through to the close.
   */
  if (insertError && insertError.code !== UNIQUE_VIOLATION) {
    console.error("Could not record the trade", insertError);
    return { ok: false, reason: "unavailable" };
  }

  const { error: closeError } = await admin
    .from("flares")
    .update({ status: "traded", updated_at: new Date().toISOString() })
    .eq("id", flareId)
    .eq("player_session_id", requesterSessionId);

  if (closeError) {
    // The tally exists; the board still shows the Flare. A retry closes it.
    console.error("Could not close the traded Flare", closeError);
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true };
}

/**
 * The viewer's trades at one event, both sides, newest first.
 *
 * Card names and partner names resolved in separate queries, same reason as
 * everywhere else: the hand-written schema mirror has no relationship
 * metadata for PostgREST embeds.
 */
export async function listMyTrades(
  eventId: string,
  sessionId: string,
): Promise<TradeRecord[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("trades")
    .select(
      "id, requester_session_id, holder_session_id, card_id, quantity, confirmed_at",
    )
    .eq("event_id", eventId)
    .or(`requester_session_id.eq.${sessionId},holder_session_id.eq.${sessionId}`)
    .order("confirmed_at", { ascending: false });

  if (error) {
    console.error("Could not read the viewer's trades", error);
    return [];
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const cardIds = [...new Set(rows.map((row) => row.card_id))];
  const partnerIds = [
    ...new Set(
      rows
        .map((row) =>
          row.requester_session_id === sessionId
            ? row.holder_session_id
            : row.requester_session_id,
        )
        .filter((id): id is string => !!id),
    ),
  ];

  const [cards, partners] = await Promise.all([
    admin
      .from("cards")
      .select("id, exact_name, canonical_card_number")
      .in("id", cardIds),
    partnerIds.length > 0
      ? admin.from("player_sessions").select("id, display_name").in("id", partnerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (cards.error || partners.error) {
    console.error("Could not resolve trade history", cards.error ?? partners.error);
    return [];
  }

  const cardsById = new Map(
    (cards.data ?? []).map((row) => [
      row.id,
      { name: row.exact_name, number: row.canonical_card_number },
    ]),
  );
  const names = new Map((partners.data ?? []).map((row) => [row.id, row.display_name]));

  return rows.map((row) => {
    const youWere = row.requester_session_id === sessionId ? "requester" : "holder";
    const partnerId =
      youWere === "requester" ? row.holder_session_id : row.requester_session_id;
    const card = cardsById.get(row.card_id);

    return {
      id: row.id,
      cardId: row.card_id,
      cardName: card?.name ?? "Unknown card",
      cardNumber: card?.number ?? "",
      quantity: row.quantity,
      youWere,
      partnerName: partnerId ? (names.get(partnerId) ?? null) : null,
      confirmedAt: row.confirmed_at,
    };
  });
}

/** The numbers a store reads after a night. Counts only — no prices, ever. */
export interface EventStats {
  players: number;
  flaresOpen: number;
  flaresTotal: number;
  offers: number;
  trades: number;
}

export async function eventStats(eventId: string): Promise<EventStats | null> {
  if (!isSupabaseConfigured()) return null;

  const admin = getSupabaseAdmin();

  const { data: flares, error: flareError } = await admin
    .from("flares")
    .select("id, status")
    .eq("event_id", eventId);

  if (flareError) {
    console.error("Could not count an event's Flares", flareError);
    return null;
  }

  const flareRows = flares ?? [];
  const flareIds = flareRows.map((row) => row.id);

  const [players, offers, trades] = await Promise.all([
    admin
      .from("event_participants")
      .select("event_id", { count: "exact", head: true })
      .eq("event_id", eventId),
    flareIds.length > 0
      ? admin
          .from("flare_responses")
          .select("id", { count: "exact", head: true })
          .in("flare_id", flareIds)
      : Promise.resolve({ count: 0, error: null }),
    admin
      .from("trades")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId),
  ]);

  if (players.error || offers.error || trades.error) {
    console.error(
      "Could not count an event's activity",
      players.error ?? offers.error ?? trades.error,
    );
    return null;
  }

  return {
    players: players.count ?? 0,
    flaresOpen: flareRows.filter((row) => row.status === "open").length,
    flaresTotal: flareRows.length,
    offers: offers.count ?? 0,
    trades: trades.count ?? 0,
  };
}
