import "server-only";

import { normalisePostalCode } from "@/lib/geo/zip";
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
 * WHERE IT SITS is the poster's own five-digit ZIP, copied onto the row.
 * Not a device coordinate: a precise position rides one request and is
 * never stored, and this row outlives its request by design. A ZIP is
 * miles across, it is what the profile already holds, and it is the
 * coarsest anchor that can still answer "near me".
 */

export type PostAreaFlareResult =
  | { ok: true; flareId: string }
  | { ok: false; reason: "no-postal-code" | "already-posted" | "unavailable" };

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
): Promise<PostAreaFlareResult> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const admin = getSupabaseAdmin();

  const { data: player } = await admin
    .from("players")
    .select("postal_code")
    .eq("id", playerId)
    .maybeSingle();

  /*
   * No ZIP, no anchor. This is a real answer rather than a failure: the
   * caller turns it into the same five-digit ask Local already shows when
   * it does not know where somebody is, so the fix is one field away
   * instead of a dead end.
   */
  const postalCode = normalisePostalCode(player?.postal_code);
  if (!postalCode) return { ok: false, reason: "no-postal-code" };

  const { data, error } = await admin
    .from("flares")
    .insert({
      event_id: null,
      player_session_id: null,
      player_id: playerId,
      posted_postal_code: postalCode,
      /* Batches group a deck posted to one board in one go. An area Flare
         is posted alone, from nowhere in particular. */
      posted_batch: null,
      deck_label: null,
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

    console.error("Could not post the area Flare", error);
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true, flareId: data.id };
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
