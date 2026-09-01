import "server-only";

import { linkSessionToPlayer, sessionForPlayer } from "@/lib/players/accounts";
import { mergePlayerSessions } from "@/lib/players/repository";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * Guest room identities that left something behind.
 *
 * A Flare records the SESSION that posted it, and an account link lives
 * on that session's `player_id`. Somebody who posted before signing in
 * has Flares hanging off a session with no account, so the board and the
 * Feed both show them as initials with no ring - the rule is written
 * down in `participants.ts`: "guests are simply absent from this map."
 *
 * That is correct for an actual guest and a trap for somebody who signed
 * up afterwards. `linkSessionToPlayer` only claims a session when the
 * account has no room identity yet, and an account has exactly one by
 * construction now - so a player's older guest session can never be
 * adopted, and its Flares are stranded from their profile, their follows
 * and their Embers on a trade, permanently.
 *
 * Reported by the founder off the deployed feed: a player whose account
 * plainly has a picture, drawn as a "W" because the Flares belong to a
 * session that is nobody.
 *
 * There is no safe key to do this automatically - a display name is not
 * an identity, and a shared phone would attach the wrong person's posts -
 * so it is a console screen where a human says "this is them".
 */
export interface OrphanSession {
  sessionId: string;
  displayName: string;
  lastSeenAt: string;
  /** What is stranded: the reason to merge, and the risk if it is wrong. */
  flares: number;
  rooms: number;
}

/** How many to show. A console list is for acting on, not for browsing. */
const ORPHANS_SHOWN = 40;

export async function listOrphanSessions(): Promise<OrphanSession[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = getSupabaseAdmin();

  const { data: sessions, error } = await admin
    .from("player_sessions")
    .select("id, display_name, last_seen_at")
    .is("player_id", null)
    .order("last_seen_at", { ascending: false })
    .limit(ORPHANS_SHOWN);

  if (error || !sessions || sessions.length === 0) {
    if (error) console.error("Could not list guest sessions", error);
    return [];
  }

  const ids = sessions.map((row) => row.id);

  /* What each one is carrying. A guest who joined a room and posted
     nothing is not worth a row: there is nothing to rescue. */
  const [flares, participants] = await Promise.all([
    admin.from("flares").select("player_session_id").in("player_session_id", ids),
    admin
      .from("event_participants")
      .select("player_session_id")
      .in("player_session_id", ids),
  ]);

  /* Counting what a SESSION left behind, so a Flare with no session — an
     area Flare, posted by an account from nowhere in particular — is not
     this tool's business and is skipped rather than counted against
     somebody. */
  const count = (rows: { player_session_id: string | null }[] | null) => {
    const out = new Map<string, number>();
    for (const row of rows ?? []) {
      if (!row.player_session_id) continue;
      out.set(row.player_session_id, (out.get(row.player_session_id) ?? 0) + 1);
    }
    return out;
  };

  const flareCount = count(flares.data);
  const roomCount = count(participants.data);

  return sessions
    .map((row) => ({
      sessionId: row.id,
      displayName: row.display_name ?? "A guest",
      lastSeenAt: row.last_seen_at,
      flares: flareCount.get(row.id) ?? 0,
      rooms: roomCount.get(row.id) ?? 0,
    }))
    .filter((row) => row.flares > 0 || row.rooms > 0);
}

export type AttachOutcome =
  { status: "linked" } | { status: "merged" } | { status: "failed"; reason: string };

/**
 * Gives a guest session to an account.
 *
 * Two shapes, because an account has exactly one room identity. If it
 * has none yet the session is simply claimed. If it already has one, the
 * guest is FOLDED INTO it by `merge_player_sessions` - one statement per
 * table, so the binder is never split across two identities halfway
 * through - and the guest's token comes with it, so the device still
 * holding it never notices.
 *
 * Irreversible on purpose: this is the console, a human has confirmed
 * the identity, and an undo would need somewhere to put the halves back.
 */
export async function attachSessionToPlayer(
  sessionId: string,
  playerId: string,
): Promise<AttachOutcome> {
  if (!isSupabaseConfigured()) return { status: "failed", reason: "No database." };

  const existing = await sessionForPlayer(playerId);

  if (!existing) {
    const linked = await linkSessionToPlayer(sessionId, playerId);
    return linked
      ? { status: "linked" }
      : { status: "failed", reason: "That session could not be claimed." };
  }

  if (existing.id === sessionId) return { status: "linked" };

  const merged = await mergePlayerSessions(sessionId, existing.id);
  return merged
    ? { status: "merged" }
    : { status: "failed", reason: "The merge did not complete. Nothing changed." };
}
