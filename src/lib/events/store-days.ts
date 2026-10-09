import "server-only";

import { goingStates, setGoing, type GoingResult } from "@/lib/events/going";
import { generateJoinCode } from "@/lib/events/join-code";
import {
  findStoreById,
  findStoreByJoinCode,
  UNIQUE_VIOLATION,
} from "@/lib/events/repository";
import { liveRoomForStore } from "@/lib/events/rooms";
import {
  dayChipLabel,
  dayWindow,
  DAY_ROOM_NAME,
  HERE_RADIUS_METERS,
  planDates,
  type PlanRefusal,
} from "@/lib/events/store-day-rules";
import { NEARBY_RADIUS_MILES } from "@/lib/feed/repository";
import { listLocals } from "@/lib/players/locals";
import { originForPlayer } from "@/lib/players/location";
import { milesBetween, storesNear } from "@/lib/stores/nearby";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { PlayerSessionRow, StoreRow } from "@/lib/supabase/types";
import { instantToLocal, localToInstant } from "@/lib/time/zone";

/**
 * Store days, on the server.
 *
 * The founder (2026-10-09): "events are all posted elsewhere in the
 * respective TCG app's and it just creates an extra step for game
 * stores to set up events... I miss the simplicity of just getting into
 * a room." So the store is the room and the day is the time:
 *
 * - "Going to Mox on Friday" lands in Friday's room at Mox. If Mox
 *   posted a night that day, that night is the room; otherwise the day
 *   room, opened by the first player going and shared by everyone after
 *   (`events.kind = 'day'`, one per store per date). For today, a room
 *   already running there (a night, the day room, a walk-in room) is the
 *   one you join, so the store never has two rooms at once.
 * - Saying Going is `setGoing`, the same seat, Flares, matches and
 *   binder picker every Night has had. Nothing below the room changes.
 * - "You're here": a phone's position, sent once when the app opens, is
 *   compared with the stores' pins and never stored. The answer is the
 *   store's counter code, the same door the QR code is.
 */

export interface StoreDayRoom {
  eventId: string;
  code: string | null;
  name: string;
  kind: "scheduled" | "day" | "walk_in";
  goingCount: number;
  youGoing: boolean;
}

export interface StoreDay {
  /** The store-local date, "2026-10-16". */
  date: string;
  /** "Today", "Tomorrow", "Fri 17". */
  label: string;
  /** The store is closed that day by its own hours. */
  closed: boolean;
  /** The room for that day, when there is one yet. */
  room: StoreDayRoom | null;
}

export interface StoreDays {
  storeId: string;
  storeName: string;
  /** The store's today, so a client can word "today" and "tomorrow". */
  today: string;
  /** The store takes days players open: walk-in trading is on. */
  openTrading: boolean;
  days: StoreDay[];
}

type RoomRow = {
  id: string;
  name: string;
  kind: "scheduled" | "day" | "walk_in";
  starts_at: string;
  join_code: string | null;
  plan_day: string | null;
  status: string;
  cancelled_at: string | null;
};

const ROOM_COLUMNS =
  "id, name, kind, starts_at, join_code, plan_day, status, cancelled_at";

/** The store's own today, in its zone. */
function storeToday(store: Pick<StoreRow, "timezone">, now: number): string {
  return instantToLocal(new Date(now), store.timezone).slice(0, 10);
}

/**
 * The rooms on each of the week's days at one store: a night the store
 * posted (the earliest, when it posted several), else the day room. For
 * today, whatever is running at the counter right now wins, because
 * that is the room a scan would put you in.
 */
async function roomsByDate(
  store: StoreRow,
  dates: string[],
  today: string,
): Promise<Map<string, RoomRow>> {
  const admin = getSupabaseAdmin();
  const from = localToInstant(`${dates[0]}T00:00`, store.timezone);
  const to = localToInstant(`${dates[dates.length - 1]}T23:59`, store.timezone);
  const byDate = new Map<string, RoomRow>();
  if (!from || !to) return byDate;

  const [posted, days] = await Promise.all([
    admin
      .from("events")
      .select(ROOM_COLUMNS)
      .eq("store_id", store.id)
      .eq("kind", "scheduled")
      .neq("status", "closed")
      .is("cancelled_at", null)
      .gte("starts_at", from.toISOString())
      .lte("starts_at", to.toISOString())
      .order("starts_at"),
    admin
      .from("events")
      .select(ROOM_COLUMNS)
      .eq("store_id", store.id)
      .eq("kind", "day")
      .neq("status", "closed")
      .in("plan_day", dates),
  ]);
  if (posted.error || days.error) {
    console.error("Could not read the store's days", posted.error ?? days.error);
  }

  for (const row of (days.data ?? []) as RoomRow[]) {
    if (row.plan_day) byDate.set(row.plan_day, row);
  }
  /* A night the store posted takes its day over a day room. */
  const postedSeen = new Set<string>();
  for (const row of (posted.data ?? []) as RoomRow[]) {
    const date = instantToLocal(new Date(row.starts_at), store.timezone).slice(0, 10);
    if (postedSeen.has(date)) continue;
    postedSeen.add(date);
    byDate.set(date, row);
  }

  /* Today: whatever the counter would put you in right now. */
  const counter = await findStoreByJoinCode(store.join_code);
  const live = counter ? await liveRoomForStore(counter) : null;
  if (live) {
    byDate.set(today, {
      id: live.id,
      name: live.name,
      kind: live.kind,
      starts_at: live.startsAt,
      join_code: null,
      plan_day: null,
      status: live.status,
      cancelled_at: null,
    });
    if (live.kind !== "walk_in") {
      const { data } = await admin
        .from("events")
        .select("join_code")
        .eq("id", live.id)
        .maybeSingle();
      byDate.get(today)!.join_code = data?.join_code ?? null;
    }
  }
  return byDate;
}

/**
 * The week at one store, as the picker shows it: each day, whether the
 * store is open, and the room there if anyone has opened one.
 */
export async function storeDays(
  storeId: string,
  viewerId: string | null,
  now: number = Date.now(),
): Promise<StoreDays | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const store = await findStoreById(storeId);
    if (!store) return null;

    const today = storeToday(store, now);
    const dates = planDates(today);
    const rooms = await roomsByDate(store, dates, today);
    const states = await goingStates(
      [...rooms.values()].map((room) => room.id),
      viewerId,
    );

    return {
      storeId: store.id,
      storeName: store.name,
      today,
      openTrading: store.walk_in_enabled,
      days: dates.map((date) => {
        const room = rooms.get(date);
        const state = room ? states.get(room.id) : undefined;
        return {
          date,
          label: dayChipLabel(date, today),
          closed: dayWindow(store.hours, date) === null,
          room: room
            ? {
                eventId: room.id,
                code: room.join_code,
                name: room.name,
                kind: room.kind,
                goingCount: state?.goingCount ?? 0,
                youGoing: state?.youGoing ?? false,
              }
            : null,
        };
      }),
    };
  } catch (error) {
    console.error("Could not read the store's days", error);
    return null;
  }
}

/** The day room for a date, opened if nobody has yet. */
async function dayRoomFor(
  store: StoreRow,
  date: string,
  now: number,
): Promise<{ ok: true; id: string } | { ok: false; reason: PlanRefusal }> {
  const window = dayWindow(store.hours, date);
  if (!window) return { ok: false, reason: "closed" };

  const startsAt = localToInstant(`${date}T${window.open}`, store.timezone);
  const closeDate = window.closesNextDay
    ? new Date(Date.UTC(...ymd(date)) + 86_400_000).toISOString().slice(0, 10)
    : date;
  const endsAt = localToInstant(`${closeDate}T${window.close}`, store.timezone);
  if (!startsAt || !endsAt) return { ok: false, reason: "unavailable" };
  if (endsAt.getTime() <= now) return { ok: false, reason: "day-over" };

  const admin = getSupabaseAdmin();
  const existing = async () => {
    const { data } = await admin
      .from("events")
      .select("id")
      .eq("store_id", store.id)
      .eq("plan_day", date)
      .maybeSingle();
    return data?.id ?? null;
  };

  const found = await existing();
  if (found) return { ok: true, id: found };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await admin
      .from("events")
      .insert({
        store_id: store.id,
        created_by: null,
        name: DAY_ROOM_NAME,
        kind: "day",
        status: "open",
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        join_code: generateJoinCode(),
        plan_day: date,
      })
      .select("id")
      .single();
    if (data) return { ok: true, id: data.id };
    if (error?.code !== UNIQUE_VIOLATION) {
      console.error("Could not open the store's day room", error);
      return { ok: false, reason: "unavailable" };
    }
    /* Two players opening the same day at once: the second takes the
       first's room. A clash on the join code just draws another. */
    const raced = await existing();
    if (raced) return { ok: true, id: raced };
  }
  return { ok: false, reason: "unavailable" };
}

function ymd(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m - 1, d];
}

export type PlanVisitResult =
  | (Extract<GoingResult, { ok: true }> & { eventId: string })
  | { ok: false; reason: PlanRefusal };

/**
 * "Going to this store on this day." Finds the day's room (the store's
 * night, what is running today, or the day room, opened if need be)
 * and says Going to it, exactly as the Going button does.
 */
export async function planVisit(
  storeId: string,
  date: string,
  playerId: string,
  displayName: string,
  deviceSession: PlayerSessionRow | null = null,
  now: number = Date.now(),
): Promise<PlanVisitResult> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const store = await findStoreById(storeId);
  if (!store) return { ok: false, reason: "not-found" };

  const today = storeToday(store, now);
  if (!planDates(today).includes(date)) return { ok: false, reason: "bad-day" };

  const rooms = await roomsByDate(store, [date], today);
  const room = rooms.get(date);
  let eventId = room?.id ?? null;

  if (!eventId) {
    /* Nothing posted and nothing running: a day room, which is the
       store's open trading, so its switch for that decides. */
    if (!store.walk_in_enabled) return { ok: false, reason: "no-open-trading" };
    const opened = await dayRoomFor(store, date, now);
    if (!opened.ok) return opened;
    eventId = opened.id;
  }

  const going = await setGoing(eventId, playerId, displayName, true, deviceSession);
  if (!going.ok) {
    return {
      ok: false,
      reason: going.reason === "no-account" ? "no-account" : "unavailable",
    };
  }
  return { ...going, eventId };
}

export interface StoreHere {
  storeId: string;
  storeName: string;
  /** The store's counter code: the room the QR code on the counter opens. */
  code: string;
}

/** Degrees of latitude in the radius, padded: the box the query narrows to. */
const BOX_DEGREES = 0.005;
const METERS_PER_MILE = 1609.344;

/**
 * The store a phone is standing in, or null. The position is used for
 * this one comparison and never written anywhere; stores' own pins
 * never leave the server either. Only a store whose pin is within
 * HERE_RADIUS_METERS counts, the nearest when two are.
 */
export async function storeHere(
  latitude: number,
  longitude: number,
): Promise<StoreHere | null> {
  if (!isSupabaseConfigured()) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const lonPad = BOX_DEGREES / Math.max(0.2, Math.cos((latitude * Math.PI) / 180));
  const { data, error } = await getSupabaseAdmin()
    .from("stores")
    .select("id, name, join_code, latitude, longitude")
    .gte("latitude", latitude - BOX_DEGREES)
    .lte("latitude", latitude + BOX_DEGREES)
    .gte("longitude", longitude - lonPad)
    .lte("longitude", longitude + lonPad)
    .limit(20);
  if (error) {
    console.error("Could not look for the store here", error);
    return null;
  }

  let best: { row: (typeof data)[number]; meters: number } | null = null;
  for (const row of data ?? []) {
    if (row.latitude === null || row.longitude === null) continue;
    const meters =
      milesBetween(
        { latitude, longitude },
        { latitude: row.latitude, longitude: row.longitude },
      ) * METERS_PER_MILE;
    if (meters > HERE_RADIUS_METERS) continue;
    if (!best || meters < best.meters) best = { row, meters };
  }
  return best
    ? { storeId: best.row.id, storeName: best.row.name, code: best.row.join_code }
    : null;
}

/**
 * The store console's "Use my current location": the store's pin, set
 * by someone standing in it. The caller has proved they run the store.
 */
export async function saveStoreLocation(
  storeId: string,
  latitude: number,
  longitude: number,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return false;
  }
  const { error } = await getSupabaseAdmin()
    .from("stores")
    .update({ latitude, longitude })
    .eq("id", storeId);
  if (error) {
    console.error("Could not save the store's location", error);
    return false;
  }
  return true;
}

export interface PickerStore {
  storeId: string;
  name: string;
  city: string | null;
  /** Miles from the player, rounded; null for a followed store we cannot place. */
  miles: number | null;
}

export interface StorePicker {
  following: PickerStore[];
  near: PickerStore[];
}

/** How many nearby stores the picker offers, and how far it looks. */
const PICKER_NEAR = 12;

/**
 * The plan-a-visit picker's first step: the stores the player follows,
 * then the ones near them that they do not, nearest first. "Near" is
 * the phone's position when the app sends one, else the profile's ZIP;
 * a guest with neither gets the search alone.
 */
export async function storePicker(
  playerId: string | null,
  device: { latitude: number; longitude: number } | null,
): Promise<StorePicker> {
  if (!isSupabaseConfigured()) return { following: [], near: [] };
  try {
    const origin = playerId ? (await originForPlayer(playerId, device)).point : device;
    const [locals, near] = await Promise.all([
      playerId ? listLocals(playerId) : Promise.resolve([]),
      origin
        ? storesNear(origin, NEARBY_RADIUS_MILES, PICKER_NEAR)
        : Promise.resolve([]),
    ]);
    const milesOf = new Map(near.map((store) => [store.storeId, store.miles]));
    const followed = new Set(locals.map((local) => local.storeId));
    return {
      following: locals.map((local) => ({
        storeId: local.storeId,
        name: local.name,
        city: local.city,
        miles: milesOf.get(local.storeId) ?? null,
      })),
      near: near
        .filter((store) => !followed.has(store.storeId))
        .map((store) => ({
          storeId: store.storeId,
          name: store.name,
          city: store.city,
          miles: store.miles,
        })),
    };
  } catch (error) {
    console.error("Could not list the stores to pick from", error);
    return { following: [], near: [] };
  }
}
