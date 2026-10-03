import "server-only";

import { NEARBY_RADIUS_MILES } from "@/lib/feed/repository";
import { countOpenFlares } from "@/lib/lists/repository";
import { listLocals } from "@/lib/players/locals";
import { storesNear } from "@/lib/stores/nearby";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { EventKind, EventStatus } from "@/lib/supabase/types";
import { goingStates } from "./going";
import { roomPhase } from "./schema";

/**
 * Nights: the rooms that matter to this player, before and while they
 * run.
 *
 * The founder, on the dock: "Trying to keep our tabs to our 'hero's'."
 * Room's slot becomes Nights, and the code door is a secondary button
 * on it. What the tab shows is every night at a store the player
 * follows or that is near them, every night they are going to wherever
 * it is, and every room live at those stores, within a fortnight.
 */

export type NightPhase = "live" | "early" | "upcoming";

export interface NightItem {
  eventId: string;
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

/** Stores "near you" are read a little deeper than the Feed shows. */
const NEARBY_STORES = 20;

/** Live rooms first, then by start time, then by name for a stable list. */
export function orderNights<
  T extends { phase: NightPhase; startsAt: string; name: string },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const liveA = a.phase === "live" ? 0 : 1;
    const liveB = b.phase === "live" ? 0 : 1;
    if (liveA !== liveB) return liveA - liveB;
    const byStart = a.startsAt.localeCompare(b.startsAt);
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

  /*
   * Two reads of the same columns: the calendar at the player's stores,
   * and the nights they are going to wherever those are. Closed rooms
   * are history; the phase rule below drops anything the clock has
   * passed without the store opening it.
   */
  const [atStores, going] = await Promise.all([
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
  ]);

  if (atStores.error || going.error) {
    console.error("Could not list the nights", atStores.error ?? going.error);
    return [];
  }

  const rows = new Map<string, NightRow>();
  for (const row of [...(atStores.data ?? []), ...(going.data ?? [])] as NightRow[]) {
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

  const candidates: Omit<NightItem, "youGoing" | "goingCount" | "flares">[] = [];
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
    if (phase !== "live" && phase !== "early" && phase !== "upcoming") continue;

    candidates.push({
      eventId: row.id,
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
  const [states, flares] = await Promise.all([
    goingStates(ids, playerId),
    countOpenFlares(ids),
  ]);

  return orderNights(
    candidates.map((night) => ({
      ...night,
      youGoing: states.get(night.eventId)?.youGoing ?? false,
      goingCount: states.get(night.eventId)?.goingCount ?? 0,
      flares: flares.get(night.eventId) ?? 0,
    })),
  );
}
