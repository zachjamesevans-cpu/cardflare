import "server-only";

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
}

function isPresent(lastSeenAt: string, now: number): boolean {
  return now - new Date(lastSeenAt).getTime() <= PRESENCE_WINDOW_MS;
}

/**
 * Adds a player to a room, or refreshes them if they are already in it.
 *
 * Upsert on `(event_id, player_session_id)`: re-scanning the printed code is
 * the most likely thing a player does, and it must rejoin rather than
 * duplicate or fail. Returns false only when the write genuinely failed.
 */
export async function joinEvent(
  eventId: string,
  playerSessionId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    console.error("Join rejected: Supabase is not configured.");
    return false;
  }

  const now = new Date().toISOString();

  const { error } = await getSupabaseAdmin()
    .from("event_participants")
    .upsert(
      { event_id: eventId, player_session_id: playerSessionId, last_seen_at: now },
      { onConflict: "event_id,player_session_id" },
    );

  if (error) {
    console.error("Could not join the event", error);
    return false;
  }

  return true;
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

/** Whether this player is already in this room. */
export async function findParticipation(
  eventId: string,
  playerSessionId: string,
): Promise<{ joinedAt: string } | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("event_participants")
    .select("joined_at")
    .eq("event_id", eventId)
    .eq("player_session_id", playerSessionId)
    .maybeSingle();

  if (error) {
    console.error("Could not check participation", error);
    return null;
  }

  return data ? { joinedAt: data.joined_at } : null;
}

/**
 * Marks a player as still here.
 *
 * Rate-limited by `TOUCH_AFTER_MS` so a player refreshing the room costs one
 * write a minute rather than one per render. Failure is swallowed: a stale
 * presence timestamp is not worth failing a page over.
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
    .select("player_session_id, joined_at, last_seen_at")
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
    .select("id, display_name")
    .in(
      "id",
      rows.map((row) => row.player_session_id),
    );

  if (sessionError) {
    console.error("Could not load participant names", sessionError);
    return [];
  }

  const nameById = new Map((sessions ?? []).map((s) => [s.id, s.display_name]));
  const now = Date.now();

  return rows
    .map((row) => ({
      playerSessionId: row.player_session_id,
      displayName: nameById.get(row.player_session_id) ?? "Player",
      joinedAt: row.joined_at,
      lastSeenAt: row.last_seen_at,
      present: isPresent(row.last_seen_at, now),
    }))
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
