import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PlayerSessionRow } from "@/lib/supabase/types";

/**
 * How long a guest identity survives.
 *
 * Long enough to cover a whole event and the walk home, short enough that a
 * phone borrowed at a counter does not carry someone else's name around for
 * months. Renewed on use, so an active player is never logged out mid-event.
 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Refresh the expiry at most this often, to avoid a write on every page view. */
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

function expiryFromNow(): string {
  return new Date(Date.now() + SESSION_TTL_MS).toISOString();
}

/**
 * Creates a guest session.
 *
 * Takes the token's hash, never the token: the caller keeps the only copy and
 * puts it in the cookie. Service role, because `player_sessions` has RLS on
 * with no policies and is unreachable from the public API by design.
 */
export async function createPlayerSession(
  displayName: string,
  tokenHash: string,
): Promise<PlayerSessionRow> {
  const { data, error } = await getSupabaseAdmin()
    .from("player_sessions")
    .insert({
      display_name: displayName,
      token_hash: tokenHash,
      expires_at: expiryFromNow(),
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Could not create the player session: ${error?.message}`, {
      cause: error,
    });
  }

  return data;
}

/**
 * Resolves a token hash to its session, or null.
 *
 * Expired rows are treated as absent rather than deleted here — a read path
 * should not depend on a write succeeding, and the row is cleaned up
 * separately. See the migration.
 */
export async function findPlayerSession(
  tokenHash: string,
): Promise<PlayerSessionRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("player_sessions")
    .select()
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    console.error("Could not look up the player session", error);
    return null;
  }

  return data ?? null;
}

/**
 * Extends a session that is being used, and records the visit.
 *
 * Rate-limited by `RENEW_AFTER_MS` so an active player costs one write a day
 * rather than one per navigation. Failure is logged and swallowed: a session
 * that could not be renewed still works until it expires, and losing the
 * renewal is not worth failing a page render over.
 */
export async function touchPlayerSession(session: PlayerSessionRow): Promise<void> {
  const age = Date.now() - new Date(session.last_seen_at).getTime();
  if (age < RENEW_AFTER_MS) return;

  const { error } = await getSupabaseAdmin()
    .from("player_sessions")
    .update({ last_seen_at: new Date().toISOString(), expires_at: expiryFromNow() })
    .eq("id", session.id);

  if (error) console.error("Could not renew the player session", error);
}

export async function renamePlayerSession(
  id: string,
  displayName: string,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("player_sessions")
    .update({ display_name: displayName })
    .eq("id", id);

  if (error) {
    throw new Error(`Could not update the display name: ${error.message}`, {
      cause: error,
    });
  }
}

/**
 * Ends a session for good.
 *
 * Deleted rather than expired: the player asked to leave, and there is nothing
 * in the row worth keeping once they have.
 */
export async function deletePlayerSession(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("player_sessions")
    .delete()
    .eq("id", id);

  if (error) console.error("Could not delete the player session", error);
}
