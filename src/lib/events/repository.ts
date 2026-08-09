import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { EventRow, StoreRow } from "@/lib/supabase/types";
import { generateJoinCode } from "./join-code";
import type {
  ClosedOccurrence,
  CreateEventRecord,
  EarlyBoard,
  EventKind,
  EventStatus,
  PublicEvent,
  PublicShow,
  PublicStore,
} from "./schema";
import { WALK_IN_ROOM_NAME } from "./schema";

export const UNIQUE_VIOLATION = "23505";

/**
 * How many times to retry a join-code collision before giving up.
 *
 * At a billion codes a collision is already remote; three attempts makes it
 * negligible while still failing loudly rather than looping forever if the
 * generator itself is broken.
 */
const CODE_ATTEMPTS = 3;

/**
 * Guards a read against an unconfigured deployment.
 *
 * `getSupabaseAdmin` throws when the service-role key is absent, which turns a
 * misconfiguration into a 500 on a page a player reached by scanning a printed
 * code. Reads degrade to "nothing found" and log instead — the same posture
 * the waitlist and player paths already take.
 *
 * Returns true when it is safe to query.
 */
function canQuery(action: string): boolean {
  if (isSupabaseConfigured()) return true;

  console.error(`Could not ${action}: Supabase is not configured.`);
  return false;
}

/**
 * Creates an event with a unique join code.
 *
 * Service role: `events` has no insert policy, and authorisation happened in
 * the action. Retries only on a unique violation of the code index, so a
 * genuine error still surfaces on the first attempt.
 */
export async function createEvent(
  input: CreateEventRecord,
  createdBy: string | null,
): Promise<EventRow> {
  const admin = getSupabaseAdmin();

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const { data, error } = await admin
      .from("events")
      .insert({
        store_id: input.storeId,
        created_by: createdBy,
        name: input.name,
        /*
         * Already instants. They arrive converted from the store's timezone,
         * because a bare "2026-09-12T18:00" parsed here would be read in the
         * server's zone — which is how a 6pm event ended up stored as 1pm.
         */
        starts_at: input.startsAt.toISOString(),
        ends_at: input.endsAt.toISOString(),
        join_code: generateJoinCode(),
        ...(input.repeatWeekly ? { repeat_weekly: true } : {}),
      })
      .select()
      .single();

    if (data) return data;

    if (error?.code !== UNIQUE_VIOLATION) {
      throw new Error(`Could not create the event: ${error?.message}`, {
        cause: error,
      });
    }
  }

  throw new Error(`Could not find an unused join code in ${CODE_ATTEMPTS} attempts.`);
}

/** Events for one store, newest first. Service role; the caller checks access. */
export async function listEventsForStore(storeId: string): Promise<EventRow[]> {
  if (!canQuery("list the store's events")) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("events")
    .select()
    .eq("store_id", storeId)
    .order("starts_at", { ascending: false });

  if (error) {
    console.error("Could not list the store's events", error);
    return [];
  }

  return data ?? [];
}

/**
 * Every event, for the admin console.
 *
 * No `stores(name)` embed: the admin page already loads stores to render them,
 * so joining here would duplicate that and lean on the `Relationships`
 * metadata in the hand-written schema mirror, which is empty. Callers that
 * need names map them by `store_id`.
 */
export async function listAllEvents(): Promise<EventRow[]> {
  if (!canQuery("list events")) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("events")
    .select()
    .order("starts_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Could not list events", error);
    return [];
  }

  return data ?? [];
}

/**
 * Closes every scheduled event whose window has ended.
 *
 * One idempotent statement: `status = 'open'` guards it, so re-running is
 * free. Closing exactly at `ends_at` is deliberate — the counter code stops
 * routing to the event at that moment (`findRunningScheduledEvent`), and an
 * event page that stayed joinable past it would split the room between the
 * event code and the walk-in room the counter opens next.
 */
export async function closeEndedScheduledEvents(
  nowIso: string,
): Promise<ClosedOccurrence[]> {
  if (!canQuery("close ended events")) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("events")
    .update({ status: "closed" })
    .eq("kind", "scheduled")
    .eq("status", "open")
    .lte("ends_at", nowIso)
    .select("id, store_id, name, starts_at, ends_at, repeat_weekly");

  if (error) {
    console.error("Could not close ended events", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    repeatWeekly: row.repeat_weekly,
  }));
}

/**
 * Whether a scheduled event already sits at this exact start.
 *
 * The recurrence roll's dedupe: two sweeps racing to create "next
 * Wednesday" must not produce two Wednesdays. A second-precision equality
 * check is enough — successors are computed from the same predecessor, so
 * duplicates land on the same instant.
 */
export async function scheduledEventExistsAt(
  storeId: string,
  startsAtIso: string,
): Promise<boolean> {
  if (!canQuery("check for an existing occurrence")) return true;

  const { data, error } = await getSupabaseAdmin()
    .from("events")
    .select("id")
    .eq("store_id", storeId)
    .eq("kind", "scheduled")
    .eq("starts_at", startsAtIso)
    .limit(1);

  if (error) {
    // Claiming it exists is the safe failure: a missed roll is recoverable
    // (the next sweep tries again from the same predecessor), a duplicate
    // event on the store's calendar is a mess someone has to clean up.
    console.error("Could not check for an existing occurrence", error);
    return true;
  }

  return (data ?? []).length > 0;
}

/** An open room as the console's live summary sees it, before liveness rules. */
export interface OpenRoomRow {
  id: string;
  storeId: string;
  name: string;
  kind: EventKind;
  startsAt: string;
  endsAt: string | null;
}

/**
 * Every room whose status is still open, across all stores.
 *
 * Raw material for the admin console's "live now" summary — `status = 'open'`
 * alone is not liveness (a scheduled event is open before doors, a walk-in
 * room can be open but long idle), so the rules live with the other room
 * rules in `rooms.ts` rather than in this query.
 */
export async function listOpenRoomsAcrossStores(): Promise<OpenRoomRow[]> {
  if (!canQuery("list open rooms")) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("events")
    .select("id, store_id, name, kind, starts_at, ends_at")
    .eq("status", "open");

  if (error) {
    console.error("Could not list open rooms", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    kind: row.kind as EventKind,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }));
}

export async function findEventById(id: string): Promise<EventRow | null> {
  if (!canQuery("load the event")) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("events")
    .select()
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Could not load the event", error);
    return null;
  }

  return data ?? null;
}

/**
 * The columns a player may see about a room.
 *
 * An explicit list rather than `*`, because this result is rendered to anyone
 * holding the code and `select()` would quietly start returning whatever
 * column a later migration adds.
 */
const PUBLIC_ROOM_COLUMNS =
  "id, name, kind, status, starts_at, ends_at, store_id, repeat_weekly, stores(name, city, region, timezone, early_board_hours)";

type PublicRoomRow = {
  id: string;
  name: string;
  kind: EventKind;
  status: EventStatus;
  starts_at: string;
  ends_at: string | null;
  store_id: string;
  repeat_weekly: boolean;
  stores: {
    name: string;
    city: string | null;
    region: string | null;
    timezone: string;
    early_board_hours: number;
  } | null;
};

function toPublicEvent(row: PublicRoomRow): PublicEvent {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    storeId: row.store_id,
    storeName: row.stores?.name ?? "A CardFlare store",
    storeCity: row.stores?.city ?? null,
    storeRegion: row.stores?.region ?? null,
    // UTC is the column default, so it is also the right fallback when the
    // embed comes back empty: it is what the store had before it said.
    storeTimeZone: row.stores?.timezone ?? "UTC",
    repeatWeekly: row.repeat_weekly,
    // Zero (off) is the safe fallback for a missing embed: a board must
    // never open early on a guess.
    earlyBoardHours: row.stores?.early_board_hours ?? 0,
  };
}

/**
 * Resolves an event's own join code.
 *
 * Only ever matches a scheduled event: a walk-in room's `join_code` is null,
 * which the database enforces. A walk-in room must be reached through
 * `src/lib/events/rooms.ts`, the only thing that knows whether it is still the
 * store's live room or a stale one that should have been closed hours ago.
 */
export async function findEventByJoinCode(code: string): Promise<PublicEvent | null> {
  if (!canQuery("resolve the join code")) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("events")
    .select(PUBLIC_ROOM_COLUMNS)
    .eq("join_code", code)
    .maybeSingle();

  if (error) {
    console.error("Could not resolve the join code", error);
    return null;
  }
  if (!data) return null;

  return toPublicEvent(data as unknown as PublicRoomRow);
}

/** Resolves a store's permanent counter code. */
export async function findStoreByJoinCode(code: string): Promise<PublicStore | null> {
  if (!canQuery("resolve the store code")) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("stores")
    .select("id, name, city, region, walk_in_enabled, timezone, early_board_hours")
    .eq("join_code", code)
    .maybeSingle();

  if (error) {
    console.error("Could not resolve the store code", error);
    return null;
  }
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    city: data.city,
    region: data.region,
    walkInEnabled: data.walk_in_enabled,
    timeZone: data.timezone,
    earlyBoardHours: data.early_board_hours,
  };
}

/**
 * The next scheduled draft whose board is already inside the early window.
 *
 * What a store's lobby or quiet screen advertises: nothing is running at
 * the counter, but Wednesday's board is taking Flares — here is its code.
 */
export async function findEarlyBoard(
  storeId: string,
  earlyBoardHours: number,
  now: number = Date.now(),
): Promise<EarlyBoard | null> {
  if (earlyBoardHours <= 0) return null;
  if (!canQuery("look for an early board")) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("events")
    .select("join_code, name, starts_at")
    .eq("store_id", storeId)
    .eq("kind", "scheduled")
    .eq("status", "draft")
    .gt("starts_at", new Date(now).toISOString())
    .lte("starts_at", new Date(now + earlyBoardHours * 60 * 60 * 1000).toISOString())
    .order("starts_at", { ascending: true })
    .limit(1);

  if (error) {
    console.error("Could not look for an early board", error);
    return null;
  }

  const row = (data ?? [])[0];
  if (!row?.join_code) return null;

  return { code: row.join_code, name: row.name, startsAt: row.starts_at };
}

/** Resolves a card show's code. */
export async function findShowByJoinCode(code: string): Promise<PublicShow | null> {
  if (!canQuery("resolve the show code")) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("shows")
    .select("id, name, city, region, timezone, starts_at, ends_at, join_code")
    .eq("join_code", code)
    .maybeSingle();

  if (error) {
    console.error("Could not resolve the show code", error);
    return null;
  }
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    city: data.city,
    region: data.region,
    timeZone: data.timezone,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    joinCode: data.join_code,
  };
}

/**
 * The store's scheduled event that a person walking in right now belongs in.
 *
 * `endsBefore` excludes an event whose window has passed but which nobody
 * remembered to close, and `startsBefore` excludes one that is open but not
 * for days yet. Ordered by start time so that when a store has both tonight's
 * event and next week's sitting open, tonight's wins.
 */
export async function findRunningScheduledEvent(
  storeId: string,
  startsBefore: string,
  endsAfter: string,
): Promise<PublicEvent | null> {
  if (!canQuery("look for a running event")) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("events")
    .select(PUBLIC_ROOM_COLUMNS)
    .eq("store_id", storeId)
    .eq("kind", "scheduled")
    .eq("status", "open")
    .lte("starts_at", startsBefore)
    .gt("ends_at", endsAfter)
    .order("starts_at", { ascending: true })
    .limit(1);

  if (error) {
    console.error("Could not look for a running event", error);
    return null;
  }

  const row = (data ?? [])[0] as unknown as PublicRoomRow | undefined;
  return row ? toPublicEvent(row) : null;
}

/**
 * The store's open walk-in room, if it has one.
 *
 * `maybeSingle` is safe because a partial unique index permits only one open
 * walk-in room per store.
 */
export async function findOpenWalkInRoom(storeId: string): Promise<PublicEvent | null> {
  if (!canQuery("look for the walk-in room")) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("events")
    .select(PUBLIC_ROOM_COLUMNS)
    .eq("store_id", storeId)
    .eq("kind", "walk_in")
    .eq("status", "open")
    .maybeSingle();

  if (error) {
    console.error("Could not look for the walk-in room", error);
    return null;
  }

  return data ? toPublicEvent(data as unknown as PublicRoomRow) : null;
}

/**
 * When somebody was last seen in a room, or null if nobody ever arrived.
 *
 * Served by `event_participants_event_seen_idx`, so this is an index read of
 * one row rather than an aggregate over the room's history.
 */
export async function latestActivityAt(eventId: string): Promise<string | null> {
  if (!canQuery("check when the room was last used")) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("event_participants")
    .select("last_seen_at")
    .eq("event_id", eventId)
    .order("last_seen_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("Could not check when the room was last used", error);
    return null;
  }

  return (data ?? [])[0]?.last_seen_at ?? null;
}

/**
 * Ends a walk-in room, stamping the finish time it never had.
 *
 * Guarded on `status = 'open'` so two requests deciding at the same moment
 * that the room has gone quiet cannot both claim to have closed it, and so the
 * partial unique index is free the instant this returns.
 *
 * Returns whether this caller was the one that closed it.
 */
export async function closeWalkInRoom(
  eventId: string,
  endedAt: string,
): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("events")
    .update({ status: "closed", ends_at: endedAt })
    .eq("id", eventId)
    .eq("status", "open")
    .select("id");

  if (error) {
    console.error("Could not close the walk-in room", error);
    return false;
  }

  return (data ?? []).length > 0;
}

/**
 * Starts a store's walk-in room.
 *
 * No join code and no end time — see the migration. A unique violation means
 * somebody else opened one in the moment between the check and this insert,
 * which the caller handles by adopting theirs.
 */
export async function openWalkInRoom(
  storeId: string,
  startedAt: string,
): Promise<{ outcome: "opened"; room: PublicEvent } | { outcome: "raced" }> {
  const { data, error } = await getSupabaseAdmin()
    .from("events")
    .insert({
      store_id: storeId,
      kind: "walk_in",
      name: WALK_IN_ROOM_NAME,
      starts_at: startedAt,
      ends_at: null,
      join_code: null,
      status: "open",
      // Nobody did. The application opened it because somebody scanned.
      created_by: null,
    })
    .select(PUBLIC_ROOM_COLUMNS)
    .maybeSingle();

  if (error?.code === UNIQUE_VIOLATION) return { outcome: "raced" };

  if (error || !data) {
    throw new Error(`Could not open the walk-in room: ${error?.message}`, {
      cause: error,
    });
  }

  return { outcome: "opened", room: toPublicEvent(data as unknown as PublicRoomRow) };
}

/**
 * Sets the store's timezone.
 *
 * The value is validated in the action against `Intl`, because that is the
 * implementation that will format with it. The column's own constraint only
 * keeps obvious rubbish out.
 */
export async function setStoreTimeZone(
  storeId: string,
  timeZone: string,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("stores")
    .update({ timezone: timeZone })
    .eq("id", storeId);

  if (error) {
    throw new Error(`Could not change the store timezone: ${error.message}`, {
      cause: error,
    });
  }
}

/** Turns walk-in trading on or off for a store. */
export async function setEarlyBoardHours(
  storeId: string,
  hours: number,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("stores")
    .update({ early_board_hours: hours })
    .eq("id", storeId);

  if (error) {
    throw new Error(`Could not change the early-board window: ${error.message}`, {
      cause: error,
    });
  }
}

export async function setWalkInEnabled(
  storeId: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("stores")
    .update({ walk_in_enabled: enabled })
    .eq("id", storeId);

  if (error) {
    throw new Error(`Could not change walk-in trading: ${error.message}`, {
      cause: error,
    });
  }
}

/** The store a signed-in member is looking at, read with the service role. */
export async function findStoreById(storeId: string): Promise<StoreRow | null> {
  if (!canQuery("load the store")) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("stores")
    .select()
    .eq("id", storeId)
    .maybeSingle();

  if (error) {
    console.error("Could not load the store", error);
    return null;
  }

  return data ?? null;
}

export async function setEventStatus(id: string, status: EventStatus): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("events")
    .update({ status })
    .eq("id", id);

  if (error) {
    throw new Error(`Could not update the event: ${error.message}`, { cause: error });
  }
}
