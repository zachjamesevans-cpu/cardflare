import "server-only";

import { addFlareBatch } from "@/lib/lists/repository";
import { notifyRoomFlare } from "@/lib/notifications/notify";
import { listOfferings, listWants } from "@/lib/players/wants";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * Joining a room posts your Flares to it.
 *
 * The founder, on the "Post all 9 to this room" row: "There's no option
 * besides the ability to post every single one to the room... I wonder
 * if it's best to just join a room and all the flares immediately get
 * posted. That's kinda the whole point of cardflare." A Flare is
 * already on the Feed, on Nearby and on any wall that matches it, so
 * the room was asking a question the player answered when they posted.
 *
 * So every way into a room ends here: the website's join, the app's
 * join, and signing in while already in one as a guest. Wants and
 * offerings both go up, because the board draws both. `addFlare`
 * upserts on the board's own key, so re-scanning the code posts
 * nothing twice, and a card taken off the board tonight stays off: the
 * next join is a fresh upsert of what is still on the list, which is
 * exactly the rule the old button had.
 *
 * One switch, on the account, on by default: the person who wants to
 * walk in and browse first turns it off in settings.
 */

export async function autoPostFor(playerId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return true;

  const { data, error } = await getSupabaseAdmin()
    .from("players")
    .select("auto_post_flares")
    .eq("id", playerId)
    .maybeSingle();

  if (error) {
    /* The default is the safe reading: a read that failed looks exactly
       like a player who never touched the switch. */
    console.error("Could not read the auto-post setting", error);
    return true;
  }

  return data?.auto_post_flares ?? true;
}

export async function setAutoPost(
  playerId: string,
  on: boolean,
): Promise<{ ok: boolean }> {
  if (!isSupabaseConfigured()) return { ok: false };

  const { error } = await getSupabaseAdmin()
    .from("players")
    .update({ auto_post_flares: on })
    .eq("id", playerId);

  if (error) {
    console.error("Could not set the auto-post setting", error);
    return { ok: false };
  }

  return { ok: true };
}

/**
 * Posts the account's open Flares onto a room's board, when the switch
 * is on. Returns how many landed. Never throws: a join that succeeded
 * must not be undone by the board.
 */
export async function postFlaresOnJoin(
  roomId: string,
  session: { id: string; display_name: string | null },
  playerId: string,
): Promise<number> {
  try {
    if (!(await autoPostFor(playerId))) return 0;

    const [wants, offerings] = await Promise.all([
      listWants(playerId),
      listOfferings(playerId),
    ]);
    if (wants.length === 0 && offerings.length === 0) return 0;

    const toInputs = (rows: typeof wants) =>
      rows.map((row) => ({
        cardId: row.cardId,
        printingId: row.printingId,
        quantity: row.quantity,
        note: row.note,
        deckLabel: row.deckLabel,
      }));

    /* Wants first: they are what the room is for. Offerings follow as
       their own batch under the showcase intent, the board's other
       direction. */
    const posted = [];
    if (wants.length > 0) {
      const batch = await addFlareBatch(roomId, session.id, toInputs(wants), "want");
      posted.push(...batch.posted);
      if (batch.posted.length > 0) {
        void notifyRoomFlare(
          roomId,
          session.id,
          session.display_name ?? "A player",
          batch.posted,
          "want",
        );
      }
    }
    if (offerings.length > 0) {
      const batch = await addFlareBatch(
        roomId,
        session.id,
        toInputs(offerings),
        "showcase",
      );
      posted.push(...batch.posted);
    }

    return posted.length;
  } catch (error) {
    console.error("Could not post the player's Flares on join", error);
    return 0;
  }
}
