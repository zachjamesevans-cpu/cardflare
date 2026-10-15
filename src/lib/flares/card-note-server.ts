import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

import { tidyCardNote } from "./card-note";

/**
 * Sets, changes or clears the note on one card of the player's own
 * Flare - "Add a note" / "Edit note" under the card when its owner
 * opens it. The owner only, worked out the way the found count is
 * (players/hunts.ts setFlareFound): an area Flare names its account, a
 * board Flare names the session behind it.
 *
 * A want's note follows: the same card on the player's list carries the
 * same reason, so Wanted near you says the same thing wherever the
 * holder met the ask.
 */
export async function setCardNote(
  playerId: string,
  flareId: string,
  raw: string | null,
): Promise<
  { ok: true; note: string | null } | { ok: false; reason: "not-yours" | "unavailable" }
> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  const admin = getSupabaseAdmin();

  const { data: flare } = await admin
    .from("flares")
    .select("id, player_id, player_session_id, card_id, printing_id, intent")
    .eq("id", flareId)
    .maybeSingle();
  if (!flare) return { ok: false, reason: "not-yours" };

  let owner = flare.player_id;
  if (!owner && flare.player_session_id) {
    const { data: session } = await admin
      .from("player_sessions")
      .select("player_id")
      .eq("id", flare.player_session_id)
      .maybeSingle();
    owner = session?.player_id ?? null;
  }
  if (owner !== playerId) return { ok: false, reason: "not-yours" };

  const note = tidyCardNote(raw);
  const { error } = await admin
    .from("flares")
    .update({ card_note: note, updated_at: new Date().toISOString() })
    .eq("id", flareId);
  if (error) {
    console.error("Could not save the card's note", error);
    return { ok: false, reason: "unavailable" };
  }

  if (flare.intent === "want") {
    let want = admin
      .from("player_wants")
      .update({ note })
      .eq("player_id", playerId)
      .eq("card_id", flare.card_id);
    want = flare.printing_id
      ? want.eq("printing_id", flare.printing_id)
      : want.is("printing_id", null);
    await want;
  }

  return { ok: true, note };
}
