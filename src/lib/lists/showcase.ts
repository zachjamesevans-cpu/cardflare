import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * Who in this room is hunting the card somebody just showcased.
 *
 * The query that makes a showcase worth posting. A Flare board already
 * knows every open want in the room, so offering a card up can answer
 * them without its owner speaking to anyone — which is the whole point
 * the founder started from: a rare card to move, and no desire to work
 * the room person by person.
 *
 * Printing specificity is honoured the same way the binder
 * cross-reference honours it. A want that names no printing is
 * answered by any showcase of that card; a want that names one is
 * answered only by a showcase of that exact printing, or by a showcase
 * that names none (the shower will bring whatever they have, and the
 * hunter can look at it). What is never done is telling somebody their
 * specific alternate art turned up when it did not.
 */
export interface ShowcaseMatch {
  flareId: string;
  playerSessionId: string;
}

export async function huntersFor(entry: {
  eventId: string;
  cardId: string;
  printingId: string | null;
  /** The showcase's own poster, who is never told about their own card. */
  excludeSessionId: string;
}): Promise<ShowcaseMatch[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("flares")
    .select("id, player_session_id, printing_id")
    .eq("event_id", entry.eventId)
    .eq("card_id", entry.cardId)
    .eq("intent", "want")
    .eq("status", "open");

  if (error) {
    console.error("Could not look for hunters", error);
    return [];
  }

  return (data ?? [])
    .filter((row) => row.player_session_id !== entry.excludeSessionId)
    .filter(
      (row) =>
        // Any printing wanted, or the exact one, or the showcase is open.
        row.printing_id === null ||
        entry.printingId === null ||
        row.printing_id === entry.printingId,
    )
    .map((row) => ({ flareId: row.id, playerSessionId: row.player_session_id }));
}

/**
 * The id of a showcase that was just posted.
 *
 * `addFlare` upserts and does not hand back the row, and the
 * notification needs something to key its dedupe on. Rather than widen
 * the write path for one caller, the row is read straight back: the
 * unique index means these four values identify exactly one.
 */
export async function findShowcase(
  eventId: string,
  playerSessionId: string,
  cardId: string,
  printingId: string | null,
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  let query = getSupabaseAdmin()
    .from("flares")
    .select("id")
    .eq("event_id", eventId)
    .eq("player_session_id", playerSessionId)
    .eq("card_id", cardId)
    .eq("intent", "showcase");

  query = printingId
    ? query.eq("printing_id", printingId)
    : query.is("printing_id", null);

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("Could not read back the showcase", error);
    return null;
  }

  return data?.id ?? null;
}
