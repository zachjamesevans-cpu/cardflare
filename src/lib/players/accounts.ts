import "server-only";

import type { User } from "@supabase/supabase-js";

import { ensureAuthUser } from "@/lib/auth/provision";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { PlayerRow, PlayerSessionRow } from "@/lib/supabase/types";
import { handleSeedFrom, handleWithSuffix } from "./handle";

const UNIQUE_VIOLATION = "23505";

/**
 * Player accounts: optional, open, and never a gate.
 *
 * A guest scans and trades with nothing but a nickname — that stays the
 * front door. An account is for the player who wants their wants and
 * history to follow them between stores, and anybody can make one from
 * the website or the app.
 *
 * The invitation path below outlived the invite-only pilot on purpose:
 * it is how the founder hands an account to somebody who asked for one
 * in person, and it creates the auth user so a later sign-in works.
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
 * Creates the players row, working around a HANDLE somebody else has.
 *
 * The name itself is free now — two people may both be "Zach" — so the
 * only thing that can collide is the handle derived from it. Tries the
 * plain one first, then "zach2", "zach3" and so on. The unique index is
 * what decides, not a lookup beforehand: two accounts can be claimed at
 * the same moment, and only the index sees both. Ten attempts is far
 * more than a pilot will ever need and still terminates.
 *
 * Returns the error to report, or null on success.
 */
export async function createPlayerWithFreeName(
  admin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  wanted: string,
  /**
   * The handle they chose, when somebody was there to choose one. Absent
   * for an admin invitation, where the account exists before its owner
   * has ever seen it, and one is derived from the name instead.
   */
  wantedHandle?: string,
): Promise<{ message: string } | null> {
  const name = wanted.trim().slice(0, 40);
  const chosen = wantedHandle?.trim().toLowerCase();
  const base = chosen || handleSeedFrom(name);

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const handle = attempt === 1 ? base : handleWithSuffix(base, attempt);

    const { error } = await admin.from("players").upsert(
      {
        user_id: userId,
        display_name: name,
        handle,
        /*
         * Choosing a handle IS the setup step, so an account created by
         * somebody who chose one is already set up. Without this,
         * `/profile` would bounce them to the very screen that one-page
         * sign-up exists to remove. An invited account has no chosen
         * handle and is still asked, which is correct: nobody has been
         * there yet to answer.
         */
        ...(chosen ? { onboarded_at: new Date().toISOString() } : {}),
      },
      { onConflict: "user_id", ignoreDuplicates: true },
    );

    if (!error) return null;
    if (error.code !== UNIQUE_VIOLATION) return error;

    /*
     * A unique violation on `user_id` means the row already exists,
     * which is success for an idempotent claim. Only a handle collision
     * is worth another attempt, and the two are told apart by which
     * constraint fired.
     */
    if (!error.message.includes("handle")) return null;

    /*
     * A handle somebody TYPED is not silently numbered. Nudging an
     * invitation's months-old name to "Zach2" is a kindness; doing it to
     * a handle a person just chose and watched being checked is a
     * different account from the one they asked for.
     */
    if (chosen) return { message: "handle-taken" };
  }

  return { message: `Could not find a free handle near "${base}"` };
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

/**
 * Ties a guest session to an account. Idempotent; never steals a link.
 *
 * Can now legitimately fail: an account has exactly one room identity, and the
 * index enforcing that refuses a second. That is not an error to shout about —
 * it means the caller should adopt the session the account already has, which
 * is what `accountRoomIdentity` does. Reported rather than logged for that
 * reason.
 */
export async function linkSessionToPlayer(
  sessionId: string,
  playerId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("player_sessions")
    .update({ player_id: playerId })
    .eq("id", sessionId)
    .is("player_id", null);

  if (!error) return true;
  if (error.code === UNIQUE_VIOLATION) return false;

  console.error("Could not link the session to the account", error);
  return false;
}

/**
 * The one room identity an account has, or null before it has joined
 * anything.
 *
 * "The one" is guaranteed by a partial unique index rather than by this query
 * picking a winner — two devices can join at the same moment, and only the
 * database sees both. Ordered anyway so that a database which somehow holds
 * two answers the same way every time instead of alternating.
 */
export async function sessionForPlayer(
  playerId: string,
): Promise<PlayerSessionRow | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("player_sessions")
    .select("*")
    .eq("player_id", playerId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    console.error("Could not look up the account's session", error);
    return null;
  }

  return data?.[0] ?? null;
}

/**
 * Room identities for a set of accounts, keyed by session.
 *
 * One query rather than one per player, and it answers the question the feed
 * actually has: a Flare knows the session that posted it, and the feed knows
 * the accounts you follow. An account has exactly one session by construction,
 * so this is a clean join rather than a best guess.
 */
export async function sessionsForPlayers(
  playerIds: string[],
): Promise<Map<string, string>> {
  if (playerIds.length === 0 || !isSupabaseConfigured()) return new Map();

  const { data, error } = await getSupabaseAdmin()
    .from("player_sessions")
    .select("id, player_id")
    .in("player_id", playerIds);

  if (error) {
    console.error("Could not look up the accounts' sessions", error);
    return new Map();
  }

  return new Map(
    (data ?? []).flatMap((row) =>
      row.player_id ? [[row.id, row.player_id] as const] : [],
    ),
  );
}

export interface PlayerListing {
  id: string;
  displayName: string;
  email: string | null;
  createdAt: string;
}

/**
 * One player's email address, read from auth.
 *
 * Separate from the bulk read above because the console needs it for a
 * single row and paging the whole roster to answer that would be silly.
 */
export async function emailForPlayer(playerId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  const admin = getSupabaseAdmin();

  const { data: player, error } = await admin
    .from("players")
    .select("user_id")
    .eq("id", playerId)
    .maybeSingle();

  if (error || !player) return null;

  const { data, error: authError } = await admin.auth.admin.getUserById(player.user_id);

  if (authError) {
    console.error("Could not read the account's address", authError.message);
    return null;
  }

  return data?.user?.email ?? null;
}

/** Accounts read per page from the auth admin API. Supabase caps this. */
const AUTH_PAGE_SIZE = 200;

/**
 * A stop, so a bug upstream cannot turn one page load into a thousand
 * round trips. Well above any plausible pilot roster; if it is ever hit
 * the console says so rather than quietly listing a subset.
 */
const AUTH_MAX_PAGES = 25;

/**
 * Every account's email address, keyed by auth user id.
 *
 * This used to be read from the accepted invitations instead, with a
 * comment claiming "every player got in through one". That stopped being
 * true the day open sign-up shipped: `openSignup` creates the auth user
 * and the players row directly and writes no invite, so everybody who
 * signed themselves up showed as "No address on file" in the console —
 * the founder's report. The address was never missing, only unread.
 *
 * Auth is the only place that actually holds it, so it is read from
 * there. Paged rather than fetched per player: one call per two hundred
 * accounts instead of one call each.
 */
async function emailsByUserId(): Promise<Map<string, string>> {
  const admin = getSupabaseAdmin();
  const emails = new Map<string, string>();

  for (let page = 1; page <= AUTH_MAX_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    });

    if (error) {
      console.error("Could not read the accounts' addresses", error.message);
      break;
    }

    const users = data?.users ?? [];
    for (const user of users) {
      if (user.email) emails.set(user.id, user.email);
    }

    /* A short page is the last page. */
    if (users.length < AUTH_PAGE_SIZE) return emails;

    if (page === AUTH_MAX_PAGES) {
      console.error(
        `Stopped reading addresses at ${AUTH_MAX_PAGES} pages; some will show as missing.`,
      );
    }
  }

  return emails;
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

  const emailByUser = await emailsByUserId();

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
