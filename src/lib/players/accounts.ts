import "server-only";

import type { User } from "@supabase/supabase-js";

import { ensureAuthUser } from "@/lib/auth/provision";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { PlayerRow } from "@/lib/supabase/types";

const UNIQUE_VIOLATION = "23505";

/**
 * Player accounts: optional, invite-only, and never a gate.
 *
 * A guest scans and trades with nothing but a nickname — that stays the
 * front door. An account is for the player who wants their wants and
 * history to follow them between stores, and for now the founder hands
 * them out one at a time.
 */

export type InvitePlayerResult =
  { outcome: "invited" } | { outcome: "already-invited" } | { outcome: "failed" };

export async function invitePlayer(
  input: { email: string; displayName: string },
  invitedBy: string,
): Promise<InvitePlayerResult> {
  const admin = getSupabaseAdmin();
  const email = input.email.trim().toLowerCase();

  const { data: existing } = await admin
    .from("player_invites")
    .select("id")
    .eq("email", email)
    .is("accepted_at", null)
    .maybeSingle();

  if (existing) return { outcome: "already-invited" };

  const { error } = await admin.from("player_invites").insert({
    email,
    display_name: input.displayName,
    invited_by: invitedBy,
  });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { outcome: "already-invited" };
    console.error("Could not create the player invitation", error);
    return { outcome: "failed" };
  }

  /*
   * The invitation is what creates the account — sign-in refuses to. Same
   * hard-won lesson as store invites: without this the player gets a
   * welcome email and can never actually get in.
   */
  await ensureAuthUser(email);

  return { outcome: "invited" };
}

/**
 * Binds a freshly signed-in account to its player invitation, if one is
 * open. Safe to call on every sign-in; a no-op once accepted. Matching is
 * on the verified email, so knowing an address is not enough to claim it.
 */
export async function claimPendingPlayerInvite(user: User): Promise<void> {
  const email = user.email?.trim().toLowerCase();
  if (!email || !isSupabaseConfigured()) return;

  const admin = getSupabaseAdmin();

  const { data: invite, error: lookupError } = await admin
    .from("player_invites")
    .select("id, display_name")
    .eq("email", email)
    .is("accepted_at", null)
    .maybeSingle();

  if (lookupError) {
    console.error("Could not look up a pending player invite", lookupError);
    return;
  }
  if (!invite) return;

  /*
   * Names are unique now, and an invitation carries whatever the admin
   * typed months ago. If somebody has taken it since, the account still
   * has to be created — being unable to sign in because a stranger
   * shares your first name is not an acceptable outcome — so the name is
   * nudged until it fits and the player can rename themselves after.
   */
  const playerError = await createPlayerWithFreeName(
    admin,
    user.id,
    invite.display_name,
  );

  if (playerError) {
    // Leave the invite open so the next sign-in retries.
    console.error("Could not create the player", playerError);
    return;
  }

  await admin
    .from("player_invites")
    .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
    .eq("id", invite.id);
}

/**
 * Creates the players row, working around a name somebody else has.
 *
 * Tries the invited name first, then "Name2", "Name3" and so on. The
 * unique index is what decides, not a lookup beforehand: two invitations
 * to the same name can be claimed at the same moment, and only the index
 * sees both. Ten attempts is far more than a pilot will ever need and
 * still terminates.
 *
 * Returns the error to report, or null on success.
 */
async function createPlayerWithFreeName(
  admin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  wanted: string,
): Promise<{ message: string } | null> {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const suffix = attempt === 1 ? "" : String(attempt);
    const name = wanted.trim().slice(0, 40 - suffix.length) + suffix;

    const { error } = await admin
      .from("players")
      .upsert(
        { user_id: userId, display_name: name },
        { onConflict: "user_id", ignoreDuplicates: true },
      );

    if (!error) return null;
    if (error.code !== UNIQUE_VIOLATION) return error;

    /*
     * A unique violation on `user_id` means the row already exists,
     * which is success for an idempotent claim. Only a name collision
     * is worth another attempt, and the two are told apart by which
     * constraint fired.
     */
    if (!error.message.includes("display_name")) return null;
  }

  return { message: `Could not find a free name near "${wanted}"` };
}

/** The persistent player behind an auth user, if they have one. */
export async function playerForUser(userId: string): Promise<PlayerRow | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("players")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Could not look up the player", error);
    return null;
  }

  return data;
}

/** Ties a guest session to an account. Idempotent; never steals a link. */
export async function linkSessionToPlayer(
  sessionId: string,
  playerId: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const { error } = await getSupabaseAdmin()
    .from("player_sessions")
    .update({ player_id: playerId })
    .eq("id", sessionId)
    .is("player_id", null);

  if (error) console.error("Could not link the session to the account", error);
}

export interface PlayerListing {
  id: string;
  displayName: string;
  email: string | null;
  createdAt: string;
}

export interface PlayerInviteListing {
  email: string;
  displayName: string;
  createdAt: string;
}

/** Accounts and open invitations, for the admin's players page. */
export async function listPlayersForAdmin(): Promise<{
  players: PlayerListing[];
  pending: PlayerInviteListing[];
}> {
  if (!isSupabaseConfigured()) return { players: [], pending: [] };

  const admin = getSupabaseAdmin();

  const [playersResult, invitesResult] = await Promise.all([
    admin.from("players").select("*").order("created_at", { ascending: false }),
    admin
      .from("player_invites")
      .select("email, display_name, created_at")
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  if (playersResult.error || invitesResult.error) {
    console.error("Could not list players", playersResult.error ?? invitesResult.error);
    return { players: [], pending: [] };
  }

  const rows = playersResult.data ?? [];

  /*
   * Emails live in auth, not in the players table; fetched one by one via
   * the admin API would be N calls, so they come from the accepted invites
   * instead — every player got in through one.
   */
  const { data: accepted } = await admin
    .from("player_invites")
    .select("email, accepted_by")
    .not("accepted_by", "is", null);

  const emailByUser = new Map(
    (accepted ?? []).map((row) => [row.accepted_by as string, row.email]),
  );

  return {
    players: rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      email: emailByUser.get(row.user_id) ?? null,
      createdAt: row.created_at,
    })),
    pending: (invitesResult.data ?? []).map((row) => ({
      email: row.email,
      displayName: row.display_name,
      createdAt: row.created_at,
    })),
  };
}
