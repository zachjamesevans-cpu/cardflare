import "server-only";

import { autoPostFor } from "@/lib/events/auto-post";
import { boardWritable, roomPhase } from "@/lib/events/schema";
import { addFlareBatch } from "@/lib/lists/repository";
import type { Accepts } from "@/lib/lists/schema";
import { notifyRoomFlare } from "@/lib/notifications/notify";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * A Flare posted after Going follows you onto the night's board.
 *
 * Saying Going posts the Flares you have at that moment (auto-post.ts).
 * A card posted from home the next day used to stay on the Feed alone,
 * so the board the roster is reading was missing exactly the thing the
 * player most recently decided they wanted. Now a post from the Feed
 * goes up on every night the player is going to whose board is taking
 * Flares: upcoming, early or live, and never one that has finished.
 *
 * The same switch as joining: a player who turned auto-post off keeps
 * their boards quiet. The board the post was made into (a live room the
 * player is standing in) is skipped, since the post already landed
 * there. Never throws, and never holds the response: the post is up.
 */

export interface FollowOnItem {
  cardId: string;
  printingId: string | null;
  quantity: number;
}

export interface FollowOnResult {
  /** Boards the cards went up on. */
  boards: number;
}

const NONE: FollowOnResult = { boards: 0 };

export async function followOntoNights(input: {
  playerId: string;
  displayName: string;
  items: FollowOnItem[];
  intent: "want" | "showcase";
  accepts: Accepts;
  /** The board the post already landed on, if any. */
  skipEventId: string | null;
}): Promise<FollowOnResult> {
  if (!isSupabaseConfigured() || input.items.length === 0) return NONE;

  try {
    if (!(await autoPostFor(input.playerId))) return NONE;
    const admin = getSupabaseAdmin();

    /* Seats hang off sessions; the account may hold several. */
    const { data: sessions, error: sessionError } = await admin
      .from("player_sessions")
      .select("id")
      .eq("player_id", input.playerId);
    if (sessionError || !sessions || sessions.length === 0) return NONE;
    const sessionIds = sessions.map((row) => row.id);

    const { data: seats, error: seatError } = await admin
      .from("event_participants")
      .select("event_id, player_session_id, last_seen_at")
      .in("player_session_id", sessionIds)
      .order("last_seen_at", { ascending: false });
    if (seatError || !seats || seats.length === 0) return NONE;

    /* One seat per night: the newest, which is the device they used last. */
    const seatOf = new Map<string, string>();
    for (const seat of seats) {
      if (seat.event_id === input.skipEventId) continue;
      if (!seatOf.has(seat.event_id)) seatOf.set(seat.event_id, seat.player_session_id);
    }
    if (seatOf.size === 0) return NONE;

    const { data: events, error: eventError } = await admin
      .from("events")
      .select("id, store_id, kind, status, starts_at, ends_at, cancelled_at")
      .in("id", [...seatOf.keys()])
      .eq("kind", "scheduled")
      .is("cancelled_at", null);
    if (eventError || !events || events.length === 0) return NONE;

    const storeIds = [...new Set(events.map((event) => event.store_id))];
    const { data: stores, error: storeError } = await admin
      .from("stores")
      .select("id, early_board_hours, timezone")
      .in("id", storeIds);
    if (storeError) return NONE;
    const storeById = new Map((stores ?? []).map((store) => [store.id, store]));

    const now = Date.now();
    let boards = 0;
    for (const event of events) {
      const store = storeById.get(event.store_id);
      if (!store) continue;
      const phase = roomPhase(
        {
          kind: event.kind,
          status: event.status,
          startsAt: event.starts_at,
          endsAt: event.ends_at,
          earlyBoardHours: store.early_board_hours,
          storeTimeZone: store.timezone,
        },
        now,
      );
      if (!boardWritable(phase)) continue;
      const sessionId = seatOf.get(event.id);
      if (!sessionId) continue;

      const batch = await addFlareBatch(
        event.id,
        sessionId,
        input.items.map((item) => ({
          cardId: item.cardId,
          printingId: item.printingId,
          quantity: item.quantity,
          note: null,
          deckLabel: null,
        })),
        input.intent,
        input.accepts,
      );
      if (batch.posted.length === 0) continue;
      boards += 1;
      if (input.intent === "want") {
        void notifyRoomFlare(
          event.id,
          sessionId,
          input.displayName,
          batch.posted,
          "want",
        );
      }
    }
    return { boards };
  } catch (error) {
    console.error("Could not follow the Flares onto the nights", error);
    return NONE;
  }
}
