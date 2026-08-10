import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { roomPhase, type PublicEvent } from "@/lib/events/schema";
import { PUBLIC_ROOM_COLUMNS, toPublicEvent } from "@/lib/events/repository";

/**
 * The room this browser is standing in.
 *
 * The app keeps a `cf_last_room` in the keychain; the website never
 * needed one, because every route in carried a code. Now that the site
 * has the app's Room tab, it needs the same answer without the same
 * storage — and it already has a better source: the sessions table
 * knows every room this session joined, and the newest one still taking
 * Flares is the room the player is actually in.
 *
 * Derived rather than remembered, which is the happier accident: a
 * player who leaves a room stops having a current room, with no stale
 * pointer to clean up.
 */

export interface CurrentRoom {
  event: PublicEvent;
  /**
   * The code that reaches it. A scheduled event has its own; a walk-in
   * room has none by design and is reached through the store's
   * permanent counter code, so that is what this falls back to.
   */
  code: string;
}

export async function currentRoomForSession(
  playerSessionId: string,
): Promise<CurrentRoom | null> {
  if (!isSupabaseConfigured()) return null;

  const admin = getSupabaseAdmin();

  const { data: participation, error } = await admin
    .from("event_participants")
    .select("event_id, last_seen_at")
    .eq("player_session_id", playerSessionId)
    .order("last_seen_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Could not find the session's rooms", error);
    return null;
  }

  const eventIds = (participation ?? []).map((row) => row.event_id);
  if (eventIds.length === 0) return null;

  const [events, codes] = await Promise.all([
    admin.from("events").select(PUBLIC_ROOM_COLUMNS).in("id", eventIds),
    admin.from("events").select("id, join_code, store_id").in("id", eventIds),
  ]);

  if (events.error || codes.error) {
    console.error("Could not load the session's rooms", events.error ?? codes.error);
    return null;
  }

  const byId = new Map(
    (events.data ?? []).map((row) => {
      const event = toPublicEvent(row as never);
      return [event.id, event];
    }),
  );
  const codeById = new Map((codes.data ?? []).map((row) => [row.id, row.join_code]));

  /*
   * Most recently seen first, and the first one still open — a closed
   * room from last week is not where anybody is standing, and an early
   * board counts because it is taking Flares tonight.
   */
  for (const id of eventIds) {
    const event = byId.get(id);
    if (!event) continue;

    const phase = roomPhase(event);
    if (phase !== "live" && phase !== "early") continue;

    const code = codeById.get(id) ?? (await storeCode(event.storeId));
    if (code) return { event, code };
  }

  return null;
}

/** The counter code, for a walk-in room that has none of its own. */
async function storeCode(storeId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("stores")
    .select("join_code")
    .eq("id", storeId)
    .maybeSingle();

  if (error) {
    console.error("Could not read the store's counter code", error);
    return null;
  }

  return data?.join_code ?? null;
}
