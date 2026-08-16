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
 *
 * A miss falls through to `player_session_tokens`, where the extra tokens
 * live: a session belongs to a person, and a person can hold it on more than
 * one device. The common case — a guest with one token — still costs exactly
 * one query, because the alias table is only consulted when the session's own
 * column did not match.
 */
export async function findPlayerSession(
  tokenHash: string,
): Promise<PlayerSessionRow | null> {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("player_sessions")
    .select()
    .eq("token_hash", tokenHash)
    .gt("expires_at", now)
    .maybeSingle();

  if (error) {
    console.error("Could not look up the player session", error);
    return null;
  }

  if (data) return data;

  const { data: alias, error: aliasError } = await admin
    .from("player_session_tokens")
    .select("player_session_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (aliasError) {
    console.error("Could not look up the session token", aliasError);
    return null;
  }
  if (!alias) return null;

  const { data: session, error: sessionError } = await admin
    .from("player_sessions")
    .select()
    .eq("id", alias.player_session_id)
    .gt("expires_at", now)
    .maybeSingle();

  if (sessionError) {
    console.error("Could not load the aliased player session", sessionError);
    return null;
  }

  return session ?? null;
}

/**
 * Gives a device a token for a session it does not yet hold.
 *
 * How a second client adopts the identity an account already has. Nothing is
 * rotated: the token already in the first device's cookie is still a token for
 * this session, so adopting never signs anybody out.
 *
 * Takes the hash, never the token — the caller keeps the only copy and puts it
 * in the cookie or hands it to the app, exactly as `createPlayerSession` does.
 */
export async function addSessionToken(
  sessionId: string,
  tokenHash: string,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("player_session_tokens")
    .upsert(
      { token_hash: tokenHash, player_session_id: sessionId },
      { onConflict: "token_hash" },
    );

  if (error) {
    throw new Error(`Could not add the session token: ${error.message}`, {
      cause: error,
    });
  }
}

/**
 * Folds one session into another.
 *
 * All of it happens inside `merge_player_sessions`, in one statement per table,
 * because doing it from here would mean a dozen round trips with the player's
 * binder split across two identities in between. See the migration for what
 * wins each collision.
 *
 * Returns whether it worked. A failed merge leaves both sessions intact, which
 * is the right failure: the caller keeps the one it has.
 */
export async function mergePlayerSessions(
  sourceId: string,
  targetId: string,
): Promise<boolean> {
  const { error } = await getSupabaseAdmin().rpc("merge_player_sessions", {
    source: sourceId,
    target: targetId,
  });

  if (error) {
    console.error("Could not merge the player sessions", error);
    return false;
  }

  return true;
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
