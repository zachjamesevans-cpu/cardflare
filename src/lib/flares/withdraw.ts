import "server-only";

import { sessionsForPlayers } from "@/lib/players/accounts";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * Taking a Flare down, and putting it back.
 *
 * The audit of 2026-10-01: "Remove" on a Flare marked it found and told
 * followers "CHUNC found it", because that is what the founder once
 * asked Remove to mean ("remove cards from flares and it's all global,
 * updates everywhere as found"). A wrong post had no way out. So a
 * Flare now has two exits, and this is the second: Take down. The row
 * goes to `cancelled`, which every reader already skips (the Feed, the
 * board, the profile, the hunts), and nothing is announced.
 *
 * Undo is a stamp, not a trick. `withdrawn_at` is set with the status,
 * and `restoreFlares` reopens only rows the SAME player took down
 * within the last minute: a toast's worth of time, not a way to revive
 * a Flare a room closed for a no-show months ago.
 */

export const UNDO_WINDOW_MS = 60 * 1000;

export interface Withdrawal {
  ok: boolean;
  /** The rows taken down, for the undo. */
  flareIds: string[];
}

/** The `.or()` clause that says "this player's, under any identity". */
async function ownedBy(playerId: string): Promise<string> {
  const sessions = [...(await sessionsForPlayers([playerId])).keys()];
  const bySession =
    sessions.length > 0
      ? `,player_session_id.in.(${sessions.map((id) => `"${id}"`).join(",")})`
      : "";
  return `player_id.eq.${playerId}${bySession}`;
}

/**
 * Takes down every open Flare in a post, or one Flare, that belongs to
 * the player. A post is a batch id (`posted_batch`); a lone Flare is its
 * own post, so either id works in `postId`.
 */
export async function withdrawFlares(
  playerId: string,
  target: { postId: string } | { flareId: string },
): Promise<Withdrawal> {
  if (!isSupabaseConfigured()) return { ok: false, flareIds: [] };

  const admin = getSupabaseAdmin();
  const owned = await ownedBy(playerId);

  let query = admin.from("flares").select("id").eq("status", "open").or(owned);
  query =
    "postId" in target
      ? query.or(`posted_batch.eq.${target.postId},id.eq.${target.postId}`)
      : query.eq("id", target.flareId);

  const { data: rows, error: readError } = await query;
  if (readError) {
    console.error("Could not find the Flares to take down", readError);
    return { ok: false, flareIds: [] };
  }

  const flareIds = (rows ?? []).map((row) => row.id);
  if (flareIds.length === 0) return { ok: true, flareIds: [] };

  const now = new Date().toISOString();
  const { error } = await admin
    .from("flares")
    .update({ status: "cancelled", withdrawn_at: now, updated_at: now })
    .in("id", flareIds);

  if (error) {
    console.error("Could not take the Flares down", error);
    return { ok: false, flareIds: [] };
  }

  return { ok: true, flareIds };
}

/**
 * The room's version, scoped to the session that posted: a guest has
 * no account, and a signed-in player in a room acts under their room
 * identity. Same stamp, same undo.
 */
export async function withdrawRoomFlare(
  flareId: string,
  playerSessionId: string,
): Promise<Withdrawal> {
  if (!isSupabaseConfigured()) return { ok: false, flareIds: [] };

  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("flares")
    .update({ status: "cancelled", withdrawn_at: now, updated_at: now })
    .eq("id", flareId)
    .eq("player_session_id", playerSessionId)
    .eq("status", "open")
    .select("id");

  if (error) {
    console.error("Could not take the Flare down", error);
    return { ok: false, flareIds: [] };
  }

  return { ok: true, flareIds: (data ?? []).map((row) => row.id) };
}

/**
 * Puts Flares back that this player took down a moment ago. Anything
 * older, or anyone else's, is left exactly as it is.
 */
export async function restoreFlares(
  playerId: string | null,
  playerSessionId: string | null,
  flareIds: string[],
): Promise<{ ok: boolean; restored: number }> {
  if (!isSupabaseConfigured() || flareIds.length === 0) {
    return { ok: false, restored: 0 };
  }
  if (!playerId && !playerSessionId) return { ok: false, restored: 0 };

  const admin = getSupabaseAdmin();
  const since = new Date(Date.now() - UNDO_WINDOW_MS).toISOString();

  const owned = playerId
    ? await ownedBy(playerId)
    : `player_session_id.eq.${playerSessionId}`;

  const { data, error } = await admin
    .from("flares")
    .update({
      status: "open",
      withdrawn_at: null,
      updated_at: new Date().toISOString(),
    })
    .in("id", flareIds)
    .eq("status", "cancelled")
    .gte("withdrawn_at", since)
    .or(owned)
    .select("id");

  if (error) {
    console.error("Could not put the Flares back", error);
    return { ok: false, restored: 0 };
  }

  return { ok: true, restored: (data ?? []).length };
}
