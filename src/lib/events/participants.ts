import "server-only";

import { embersEarnedFor } from "@/lib/players/embers";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * How recently a player must have loaded the room to count as "here now".
 *
 * Long enough that someone who put their phone away to look through a binder
 * is still listed — which is exactly when a trade is happening. Too short and
 * the room looks empty at the moment it is busiest.
 */
export const PRESENCE_WINDOW_MS = 15 * 60 * 1000;

/** Refresh `last_seen_at` at most this often, so a reload is not a write. */
const TOUCH_AFTER_MS = 60 * 1000;

export interface Participant {
  playerSessionId: string;
  displayName: string;
  joinedAt: string;
  lastSeenAt: string;
  /** Seen inside the presence window. */
  present: boolean;
  /**
   * Not after anything specific, and will consider any trade.
   *
   * Public to the room, unlike the Have list — it is an invitation to come
   * over, which is the opposite of "this person is carrying a $200 alt art".
   */
  openToTrades: boolean;
  /**
   * Lifetime Embers, or null for a guest.
   *
   * The public half of the two-number rule: this is the badge, it only
   * goes up, and it says how much trading somebody has actually done.
   * Null rather than zero for a guest on purpose — a guest has not
   * earned nothing, they have no account for a total to belong to, and
   * a zero beside their name would read as a judgement.
   */
  embersEarned: number | null;
  /**
   * The account behind the session, or null for a guest.
   *
   * Present so a name in the room can link to a profile. A guest has
   * nothing to link to, which is not a gap to fill — the whole flash
   * event loop works without an account and always will.
   */
  playerId: string | null;
}

function isPresent(lastSeenAt: string, now: number): boolean {
  return now - new Date(lastSeenAt).getTime() <= PRESENCE_WINDOW_MS;
}

/** Postgres unique violation: this player is already in this room. */
const UNIQUE_VIOLATION = "23505";

/**
 * Puts a player in a room.
 *
 * Sends **no timestamps at all**. Both columns default to the database's
 * `now()`, so they come from one clock and `last_seen_at >= joined_at` holds
 * by construction.
 *
 * This is a regression fix, and the failure was total: the first version sent
 * `last_seen_at` from the application clock while `joined_at` took the column
 * default. The default is evaluated when the insert reaches Postgres, which is
 * a network hop later, so `last_seen_at` was reliably a hundred milliseconds
 * *earlier* than `joined_at` and every single join violated the check
 * constraint. Never mix a client timestamp with a server default in one row.
 *
 * Re-scanning the printed code is the most likely thing a player does, so a
 * unique violation means "already here" and is a success. Presence is not
 * refreshed here — `touchParticipation` owns that, and it runs on the very
 * next render.
 */
export async function joinEvent(
  eventId: string,
  playerSessionId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    console.error("Join rejected: Supabase is not configured.");
    return false;
  }

  const { error } = await getSupabaseAdmin()
    .from("event_participants")
    .insert({ event_id: eventId, player_session_id: playerSessionId });

  if (!error) return true;
  if (error.code === UNIQUE_VIOLATION) return true;

  console.error("Could not join the event", error);
  return false;
}

export async function leaveEvent(
  eventId: string,
  playerSessionId: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const { error } = await getSupabaseAdmin()
    .from("event_participants")
    .delete()
    .eq("event_id", eventId)
    .eq("player_session_id", playerSessionId);

  if (error) console.error("Could not leave the event", error);
}

/**
 * Says whether a player is open to any trade.
 *
 * Scoped to one room on purpose: somebody can be up for anything at Friday
 * locals and heads-down at a tournament, and the flag leaves with them when
 * they leave the room — so it can never go stale the way a portable list can.
 *
 * Both ids are checked in the `where`, so this can only ever change the
 * caller's own row in the room they are actually in.
 */
export async function setOpenToTrades(
  eventId: string,
  playerSessionId: string,
  open: boolean,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("event_participants")
    .update({ open_to_trades: open })
    .eq("event_id", eventId)
    .eq("player_session_id", playerSessionId);

  if (error) {
    throw new Error(`Could not change the trade status: ${error.message}`, {
      cause: error,
    });
  }
}

/** Whether this player is already in this room. */
export async function findParticipation(
  eventId: string,
  playerSessionId: string,
): Promise<{ joinedAt: string; lastSeenAt: string } | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("event_participants")
    .select("joined_at, last_seen_at")
    .eq("event_id", eventId)
    .eq("player_session_id", playerSessionId)
    .maybeSingle();

  if (error) {
    console.error("Could not check participation", error);
    return null;
  }

  return data ? { joinedAt: data.joined_at, lastSeenAt: data.last_seen_at } : null;
}

/**
 * Marks a player as still here.
 *
 * Rate-limited by `TOUCH_AFTER_MS`, so a player sitting in the room costs one
 * write a minute rather than one per render. That comparison must be against
 * `last_seen_at` and not `joined_at` — against `joined_at` the gap only ever
 * grows, so an hour into an event every single render would write.
 *
 * The minimum gap is also what keeps this safe next to the check constraint:
 * a minute of real elapsed time dwarfs any clock difference between the app
 * and the database, so the new `last_seen_at` cannot land before `joined_at`.
 *
 * Failure is swallowed. A stale presence timestamp is not worth failing a page
 * render over.
 */
export async function touchParticipation(
  eventId: string,
  playerSessionId: string,
  lastSeenAt: string,
): Promise<void> {
  if (Date.now() - new Date(lastSeenAt).getTime() < TOUCH_AFTER_MS) return;

  const { error } = await getSupabaseAdmin()
    .from("event_participants")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .eq("player_session_id", playerSessionId);

  if (error) console.error("Could not refresh presence", error);
}

/**
 * Everyone in a room, present players first.
 *
 * Display names are read from `player_sessions` at query time rather than
 * copied onto the participant row, so fixing a typo in a name updates every
 * room the player is in.
 */
export async function listParticipants(eventId: string): Promise<Participant[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("event_participants")
    .select("player_session_id, joined_at, last_seen_at, open_to_trades")
    .eq("event_id", eventId)
    .order("last_seen_at", { ascending: false });

  if (error) {
    console.error("Could not list participants", error);
    return [];
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Separate query rather than an embed: the hand-written schema mirror has no
  // relationship metadata, so an embed would not type and would silently
  // return an error object at runtime.
  const { data: sessions, error: sessionError } = await getSupabaseAdmin()
    .from("player_sessions")
    .select("id, display_name, player_id")
    .in(
      "id",
      rows.map((row) => row.player_session_id),
    );

  if (sessionError) {
    console.error("Could not load participant names", sessionError);
    return [];
  }

  const nameById = new Map((sessions ?? []).map((s) => [s.id, s.display_name]));

  /*
   * The Ember badges, in one query for the whole room rather than one
   * per person. Guests are simply absent from this map, which is what
   * makes the badge null for them further down.
   */
  const earned = await embersEarnedFor(
    (sessions ?? []).map((s) => s.player_id).filter((id): id is string => Boolean(id)),
  );
  const accountBySession = new Map(
    (sessions ?? []).map((s) => [s.id, s.player_id as string | null]),
  );

  const now = Date.now();

  return rows
    .map((row) => {
      const account = accountBySession.get(row.player_session_id) ?? null;
      return {
        playerSessionId: row.player_session_id,
        displayName: nameById.get(row.player_session_id) ?? "Player",
        joinedAt: row.joined_at,
        lastSeenAt: row.last_seen_at,
        present: isPresent(row.last_seen_at, now),
        openToTrades: row.open_to_trades,
        embersEarned: account ? (earned.get(account) ?? 0) : null,
        playerId: account,
      };
    })
    .sort((a, b) => Number(b.present) - Number(a.present));
}

/** Participant counts for a store's event list. */
export async function countParticipants(
  eventIds: string[],
): Promise<Map<string, { total: number; present: number }>> {
  const counts = new Map<string, { total: number; present: number }>();
  if (eventIds.length === 0 || !isSupabaseConfigured()) return counts;

  const { data, error } = await getSupabaseAdmin()
    .from("event_participants")
    .select("event_id, last_seen_at")
    .in("event_id", eventIds);

  if (error) {
    console.error("Could not count participants", error);
    return counts;
  }

  const now = Date.now();

  for (const row of data ?? []) {
    const entry = counts.get(row.event_id) ?? { total: 0, present: 0 };
    entry.total += 1;
    if (isPresent(row.last_seen_at, now)) entry.present += 1;
    counts.set(row.event_id, entry);
  }

  return counts;
}
