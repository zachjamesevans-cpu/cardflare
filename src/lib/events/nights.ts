import "server-only";

import { countParticipants } from "@/lib/events/participants";
import { NEARBY_RADIUS_MILES } from "@/lib/feed/repository";
import { countOpenFlares } from "@/lib/lists/repository";
import { listLocals } from "@/lib/players/locals";
import { storesNear } from "@/lib/stores/nearby";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { EventKind, EventStatus } from "@/lib/supabase/types";
import { goingStates } from "./going";
import { nightMatchSummaries } from "./night-matches";
import { roomPhase } from "./schema";

/**
 * Nights: the rooms that matter to this player, before and while they
 * run.
 *
 * The founder, on the dock: "Trying to keep our tabs to our 'hero's'."
 * Room's slot becomes Nights, and the code door is a secondary button
 * on it. What the tab shows is every night at a store the player
 * follows or that is near them, every night they are going to wherever
 * it is, and every room live at those stores, within a fortnight; and,
 * for the Past tab, the nights they went to in the last thirty days.
 *
 * Round 2, the founder: "Potential matches should have significantly
 * more visual priority than generic attendance." So a night the
 * player is going to carries how many matches the dashboard found.
 */

export type NightPhase = "live" | "early" | "upcoming" | "finished";

export interface NightItem {
  eventId: string;
  /**
   * "scheduled" for a night the store posted, "day" for a store's day
   * players opened by saying they were going, "walk_in" for a room
   * opened at the counter.
   */
  kind: EventKind;
  code: string | null;
  name: string;
  startsAt: string;
  endsAt: string | null;
  timeZone: string;
  storeId: string;
  storeName: string;
  storeVerified: boolean;
  city: string | null;
  phase: NightPhase;
  youGoing: boolean;
  goingCount: number;
  /** Seen inside the presence window. Zero once the night is finished. */
  hereNow: number;
  /**
   * The dashboard's total for a night the viewer is going to; null for
   * one they are not going to, and for a finished night, where there
   * is nothing left to match. Null and zero draw differently: zero is
   * "no matches", null is "not yours to have matches at".
   */
  matches: number | null;
  /** Flares on the board. */
  flares: number;
  following: boolean;
}

/** How far ahead the list looks. */
const HORIZON_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * How far back. A night is at most 24 hours long and its early board
 * runs until it ends, so two days covers every draft still worth a row
 * and every open room that has not been swept.
 */
const LOOKBACK_MS = 48 * 60 * 60 * 1000;

/** How far back the Past tab reaches for nights the player went to. */
const PAST_MS = 30 * 24 * 60 * 60 * 1000;

/** Stores "near you" are read a little deeper than the Feed shows. */
const NEARBY_STORES = 20;

/**
 * Live rooms first, then what is coming by start time, then what is
 * over newest first, and by name within a tie for a stable list.
 */
export function orderNights<
  T extends { phase: NightPhase; startsAt: string; name: string },
>(items: T[]): T[] {
  const rank = (phase: NightPhase) =>
    phase === "live" ? 0 : phase === "finished" ? 2 : 1;
  return [...items].sort((a, b) => {
    const rankA = rank(a.phase);
    const rankB = rank(b.phase);
    if (rankA !== rankB) return rankA - rankB;
    const byStart =
      rankA === 2
        ? b.startsAt.localeCompare(a.startsAt)
        : a.startsAt.localeCompare(b.startsAt);
    if (byStart !== 0) return byStart;
    return a.name.localeCompare(b.name);
  });
}

type NightRow = {
  id: string;
  store_id: string;
  name: string;
  kind: EventKind;
  status: EventStatus;
  starts_at: string;
  ends_at: string | null;
  join_code: string | null;
  cancelled_at: string | null;
};

const NIGHT_COLUMNS =
  "id, store_id, name, kind, status, starts_at, ends_at, join_code, cancelled_at";

/** The rooms this account holds a seat in, from any of its sessions. */
async function seatedEventIds(playerId: string): Promise<string[]> {
  const admin = getSupabaseAdmin();

  const { data: sessions, error } = await admin
    .from("player_sessions")
    .select("id")
    .eq("player_id", playerId);
  if (error || !sessions || sessions.length === 0) {
    if (error) console.error("Could not look up the account's sessions", error);
    return [];
  }

  const { data: seats, error: seatError } = await admin
    .from("event_participants")
    .select("event_id")
    .in(
      "player_session_id",
      sessions.map((session) => session.id),
    );
  if (seatError) {
    console.error("Could not look up the account's seats", seatError);
    return [];
  }

  return [...new Set((seats ?? []).map((seat) => seat.event_id))];
}

export async function listNights(
  playerId: string | null,
  origin: { latitude: number; longitude: number } | null,
): Promise<NightItem[]> {
  if (!isSupabaseConfigured()) return [];

  const [locals, near, seated] = await Promise.all([
    playerId ? listLocals(playerId) : Promise.resolve([]),
    origin
      ? storesNear(origin, NEARBY_RADIUS_MILES, NEARBY_STORES)
      : Promise.resolve([]),
    playerId ? seatedEventIds(playerId) : Promise.resolve([]),
  ]);

  const followed = new Set(locals.map((local) => local.storeId));
  const storeIds = [...new Set([...followed, ...near.map((store) => store.storeId)])];
  if (storeIds.length === 0 && seated.length === 0) return [];

  const admin = getSupabaseAdmin();
  const now = Date.now();
  const lower = new Date(now - LOOKBACK_MS).toISOString();
  const upper = new Date(now + HORIZON_MS).toISOString();
  const pastLower = new Date(now - PAST_MS).toISOString();

  /*
   * Three reads of the same columns: the calendar at the player's
   * stores, the nights they are going to wherever those are, and the
   * closed nights they held a seat at in the last month, for Past. The
   * phase rule below drops anything the clock has passed without the
   * store opening it.
   */
  const [atStores, going, past] = await Promise.all([
    storeIds.length > 0
      ? admin
          .from("events")
          .select(NIGHT_COLUMNS)
          .in("store_id", storeIds)
          .in("status", ["draft", "open"])
          .gte("starts_at", lower)
          .lte("starts_at", upper)
      : Promise.resolve({ data: [] as NightRow[], error: null }),
    seated.length > 0
      ? admin
          .from("events")
          .select(NIGHT_COLUMNS)
          .in("id", seated)
          .in("status", ["draft", "open"])
          .gte("starts_at", lower)
          .lte("starts_at", upper)
      : Promise.resolve({ data: [] as NightRow[], error: null }),
    seated.length > 0
      ? admin
          .from("events")
          .select(NIGHT_COLUMNS)
          .in("id", seated)
          .eq("status", "closed")
          .gte("starts_at", pastLower)
      : Promise.resolve({ data: [] as NightRow[], error: null }),
  ]);

  if (atStores.error || going.error || past.error) {
    console.error(
      "Could not list the nights",
      atStores.error ?? going.error ?? past.error,
    );
    return [];
  }

  const rows = new Map<string, NightRow>();
  for (const row of [
    ...(atStores.data ?? []),
    ...(going.data ?? []),
    ...(past.data ?? []),
  ] as NightRow[]) {
    if (row.cancelled_at) continue;
    rows.set(row.id, row);
  }
  if (rows.size === 0) return [];

  /* The stores behind them, one query: a night the player is going to
     may be at a shop that is neither followed nor near. */
  const { data: stores, error: storeError } = await admin
    .from("stores")
    .select("id, name, city, timezone, early_board_hours, verified_at")
    .in("id", [...new Set([...rows.values()].map((row) => row.store_id))]);
  if (storeError) {
    console.error("Could not read the nights' stores", storeError);
    return [];
  }
  const storeById = new Map((stores ?? []).map((store) => [store.id, store]));

  const candidates: Omit<
    NightItem,
    "youGoing" | "goingCount" | "hereNow" | "matches" | "flares"
  >[] = [];
  for (const row of rows.values()) {
    const store = storeById.get(row.store_id);
    if (!store) continue;

    const phase = roomPhase(
      {
        kind: row.kind,
        status: row.status,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        earlyBoardHours: store.early_board_hours,
        storeTimeZone: store.timezone,
      },
      now,
    );
    /* A start that passed without the store opening it is a door with
       nothing behind it, and not a night anyone went to. */
    if (phase === "pending") continue;

    candidates.push({
      eventId: row.id,
      kind: row.kind,
      code: row.join_code,
      name: row.name,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      timeZone: store.timezone,
      storeId: store.id,
      storeName: store.name,
      storeVerified: store.verified_at !== null,
      city: store.city,
      phase,
      following: followed.has(store.id),
    });
  }
  if (candidates.length === 0) return [];

  const ids = candidates.map((night) => night.eventId);
  const [states, flares, present] = await Promise.all([
    goingStates(ids, playerId),
    countOpenFlares(ids),
    countParticipants(ids),
  ]);

  /* The dashboard's total, only where it means something: a night the
     viewer is going to that has not ended. One batch for all of them. */
  const matchable = candidates.filter(
    (night) => night.phase !== "finished" && states.get(night.eventId)?.youGoing,
  );
  const summaries = playerId
    ? await nightMatchSummaries(
        matchable.map((night) => night.eventId),
        playerId,
      )
    : new Map<string, { total: number }>();

  return orderNights(
    candidates.map((night) => {
      const state = states.get(night.eventId);
      const summary = summaries.get(night.eventId);
      return {
        ...night,
        youGoing: state?.youGoing ?? false,
        goingCount: state?.goingCount ?? 0,
        hereNow:
          night.phase === "finished" ? 0 : (present.get(night.eventId)?.present ?? 0),
        matches: summary ? summary.total : null,
        flares: flares.get(night.eventId) ?? 0,
      };
    }),
  );
}
