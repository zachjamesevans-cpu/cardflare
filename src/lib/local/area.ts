import "server-only";

import { randomUUID } from "node:crypto";

import { nearestPostalCode, normalisePostalCode, type Point } from "@/lib/geo/zip";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * Posting a Flare from wherever you are.
 *
 * The founder, on what Local should be: "people can see all flares nearby
 * and can message people directly. should be intuitive." Until now a
 * Flare could only be posted by standing at a counter with a QR code, so
 * Local could only show what had been posted at a shop — which on any of
 * the twenty-six nights nobody is at locals is nothing at all.
 *
 * An area Flare is the same act minus the room: it says what you are
 * hunting, it is answered by a thread, and it is deliberately public. It
 * is NOT your want list. Nothing here reads `player_wants`, and nothing
 * ever should: a saved want is a private note and the oldest rule in the
 * product is that binders and lists stay private. This is the second
 * place a player can choose to be seen, and the choosing is the point.
 *
 * WHERE IT SITS, when it sits anywhere, is the poster's own five-digit
 * ZIP, copied onto the row. Not a device coordinate: a precise position
 * rides one request and is never stored, and this row outlives its
 * request by design. A ZIP is miles across, it is what the profile
 * already holds, and it is the coarsest anchor that can still answer
 * "near me".
 *
 * And it is optional. With Local switched off (src/lib/local/enabled.ts)
 * a Flare with no room goes to the poster's friends in the Feed, who
 * are found by friendship and not by distance, so demanding a ZIP
 * first was a wall in front of nothing. The founder: "No need to have
 * that requirement now because it just shows your flares to your
 * friends in the feed." A ZIP is still written when there is one, so
 * Local finds the Flare again the day it is switched back on.
 */

export type PostAreaFlareResult =
  | { ok: true; flareId: string }
  | {
      ok: false;
      reason: "already-posted" | "not-migrated" | "unavailable";
    };

/**
 * Whether the area-Flare columns are actually there.
 *
 * Deploying the app and applying the migrations are two acts in this
 * project and nothing runs the second one automatically, so there is
 * always a window where this code is live and `flares.player_id` does
 * not exist yet. Every insert then dies on a not-null `event_id` or an
 * unknown column, and the honest 500 that follows reaches a player as
 * "Could not post that" — which sends whoever reads it looking for a bug
 * in the app. One cheap probe turns that into a sentence that names the
 * real cause. The store directory answers the same question the same
 * way; see `directorySchemaReady`.
 */
export async function areaFlareSchemaReady(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("flares")
    .select("player_id, posted_postal_code")
    .limit(1);

  return !error;
}

export type PostAreaFlaresResult =
  | { ok: true; batchId: string; posted: number }
  | {
      ok: false;
      reason: "already-posted" | "not-migrated" | "unavailable";
    };

export interface AreaFlareInput {
  cardId: string;
  /** Null means any printing will do — the same default a board uses. */
  printingId?: string | null;
  quantity?: number;
  note?: string | null;
  /** "want" is hunting it; "showcase" is offering it up. */
  intent?: "want" | "showcase";
  acceptsTrade?: boolean;
  acceptsCash?: boolean;
}

export async function postAreaFlare(
  playerId: string,
  input: AreaFlareInput,
  /*
   * Where the poster is browsing from, when they granted it.
   *
   * Local takes EITHER a device coordinate or the profile's ZIP as an
   * origin, and the first cut of this function accepted only the ZIP —
   * so everyone who had granted the browser the more precise thing was
   * told to go and type the less precise one before they could post.
   * The coordinate rides this one request and is snapped to a centroid;
   * what lands on the row is five digits, exactly as if they had been
   * typed, and the position itself is never written.
   */
  at?: Point | null,
  /** Set when this card is one of several posted in one action. */
  group?: { batchId: string; deckLabel: string | null },
): Promise<PostAreaFlareResult> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  if (!(await areaFlareSchemaReady())) return { ok: false, reason: "not-migrated" };

  const admin = getSupabaseAdmin();

  const { data: player } = await admin
    .from("players")
    .select("postal_code")
    .eq("id", playerId)
    .maybeSingle();

  /*
   * The ZIP when there is one, from the profile first and a granted
   * position second, snapped to a centroid. None is not a refusal any
   * more: the Flare goes to friends either way, and only Local's radius
   * would have wanted the anchor.
   */
  const postalCode =
    normalisePostalCode(player?.postal_code) ?? nearestPostalCode(at ?? null);

  const { data, error } = await admin
    .from("flares")
    .insert({
      event_id: null,
      player_session_id: null,
      player_id: playerId,
      posted_postal_code: postalCode ?? null,
      /* The batch is what makes several cards read as one post, exactly
         as it does on a room's board. Null when a card goes up alone. */
      posted_batch: group?.batchId ?? null,
      deck_label: group?.deckLabel ?? null,
      card_id: input.cardId,
      printing_id: input.printingId ?? null,
      quantity: input.quantity ?? 1,
      note: input.note ?? null,
      intent: input.intent ?? "want",
      accepts_trade: input.acceptsTrade ?? true,
      accepts_cash: input.acceptsCash ?? false,
    })
    .select("id")
    .single();

  if (error) {
    /* The partial unique index: one open area Flare per card per person.
       Posting the same card twice is not an error worth a red line — it
       is already up. */
    if (error.code === "23505") return { ok: false, reason: "already-posted" };

    /* The shapes a missing migration takes: the column is not there, or
       `event_id` is still not-null, or the two-shapes check still
       demands a ZIP this row does not carry. All one cause, and not the
       player's. */
    if (["42703", "23502", "23514"].includes(error.code ?? "")) {
      console.error("The area-Flare migration has not been applied", error);
      return { ok: false, reason: "not-migrated" };
    }

    console.error("Could not post the area Flare", error);
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true, flareId: data.id };
}

/**
 * Several cards, posted as one thing.
 *
 * The founder: "should be able to post multiple flares in one group in
 * local — so it looks like one post." A board already works this way and
 * has since `posted_batch` arrived: a deck put up in one action is told
 * to the room once and shows as one item rather than thirty. Local was
 * one card at a time, so building a deck there meant thirty separate
 * posts scrolling past everybody nearby.
 *
 * One batch id across the lot, which is the whole mechanism — the feed
 * groups on it exactly as the room's board does, and nothing new is
 * needed in the schema to carry it.
 *
 * A card already up is NOT a failure. Re-posting a list after adding two
 * cards to it should cost two rows and say so, rather than refusing the
 * whole batch over the twenty-eight that were already there.
 */
export async function postAreaFlares(
  playerId: string,
  inputs: AreaFlareInput[],
  at?: Point | null,
  deckLabel?: string | null,
): Promise<PostAreaFlaresResult> {
  if (inputs.length === 0) return { ok: false, reason: "unavailable" };

  const batchId = randomUUID();
  let posted = 0;
  let lastRefusal: PostAreaFlareResult | null = null;

  for (const input of inputs) {
    const result = await postAreaFlare(playerId, input, at, {
      batchId,
      deckLabel: deckLabel ?? null,
    });

    if (result.ok) {
      posted += 1;
      continue;
    }

    /* A duplicate is somebody re-posting a list they have grown; skip it
       and keep going. Anything else is the same wall for every remaining
       card — a missing migration — so stop rather than write it out
       thirty times. */
    lastRefusal = result;
    if (result.reason !== "already-posted") break;
  }

  if (posted > 0) return { ok: true, batchId, posted };
  return lastRefusal ?? { ok: false, reason: "unavailable" };
}

/**
 * Taking one down.
 *
 * Cancelled rather than deleted, the same as a board Flare: a thread
 * about it still exists and should still read, and a conversation whose
 * subject vanished is worse than one whose subject is closed.
 */
export async function withdrawAreaFlare(
  playerId: string,
  flareId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("flares")
    .update({ status: "cancelled" })
    .eq("id", flareId)
    .eq("player_id", playerId)
    .is("event_id", null);

  if (error) console.error("Could not withdraw the area Flare", error);
  return !error;
}
