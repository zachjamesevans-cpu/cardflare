import "server-only";

import { binderSessionFor } from "@/lib/lists/haves";
import { addToBinder } from "@/lib/lists/repository";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

import { afterHolderChanged } from "./matching";

/**
 * A showcase is a Have, passively.
 *
 * The founder: when "I have this" is selected and posted, "make sure
 * that when someone is looking for that card nearby, it'll match them
 * together... basically just a passive way to add to their list of
 * haves." A showcase Flare already says the two things the Have list
 * asks for, that you have the card and would let it go, so it lands
 * on the list with Trade locally on and nearby matching looks at once.
 *
 * Best-effort, after the Flare has already posted: a full Have list or
 * a guest with no account must never undo a post. A guest's card still
 * lands on their session's binder for the room, and nearby matching
 * ignores it until the session belongs to an account.
 */
export async function keepShowcaseAsHave(
  holder: { playerSessionId: string | null; playerId: string | null },
  entry: {
    cardId: string;
    printingId: string | null;
    quantity: number;
    note: string | null;
  },
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const admin = getSupabaseAdmin();

    let sessionId = holder.playerSessionId;
    let playerId = holder.playerId;

    if (!sessionId && playerId) {
      const { data: player } = await admin
        .from("players")
        .select("display_name")
        .eq("id", playerId)
        .maybeSingle();
      const session = await binderSessionFor(
        playerId,
        player?.display_name ?? "A player",
        true,
      );
      sessionId = session?.id ?? null;
    } else if (sessionId && !playerId) {
      const { data: session } = await admin
        .from("player_sessions")
        .select("player_id")
        .eq("id", sessionId)
        .maybeSingle();
      playerId = session?.player_id ?? null;
    }
    if (!sessionId) return;

    const added = await addToBinder(sessionId, {
      cardId: entry.cardId,
      printingId: entry.printingId,
      quantity: entry.quantity,
      note: entry.note,
      deckLabel: null,
    });
    if (!added.ok) return;

    /* Marked by the row's identity rather than an id addToBinder does
       not return; the same upsert key it wrote under. */
    let mark = admin
      .from("player_cards")
      .update({ local_trade: true })
      .eq("player_session_id", sessionId)
      .eq("card_id", entry.cardId);
    mark = entry.printingId
      ? mark.eq("printing_id", entry.printingId)
      : mark.is("printing_id", null);
    const { error } = await mark;
    if (error) {
      console.error("Could not mark the showcase for local trade", error);
      return;
    }

    if (playerId) void afterHolderChanged(playerId, entry.cardId);
  } catch (error) {
    console.error("Could not keep the showcase as a Have", error);
  }
}
