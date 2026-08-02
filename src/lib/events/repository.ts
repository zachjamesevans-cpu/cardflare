import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { EventRow, StoreRow } from "@/lib/supabase/types";
import { generateJoinCode } from "./join-code";
import type {
  CreateEventInput,
  EventKind,
  EventStatus,
  PublicEvent,
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
  input: CreateEventInput,
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
        starts_at: new Date(input.startsAt).toISOString(),
        ends_at: new Date(input.endsAt).toISOString(),
        join_code: generateJoinCode(),
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
  "id, name, kind, status, starts_at, ends_at, stores(name, city, region)";

type PublicRoomRow = {
  id: string;
  name: string;
  kind: EventKind;
  status: EventStatus;
  starts_at: string;
  ends_at: string | null;
  stores: { name: string; city: string | null; region: string | null } | null;
};

function toPublicEvent(row: PublicRoomRow): PublicEvent {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    storeName: row.stores?.name ?? "A CardFlare store",
    storeCity: row.stores?.city ?? null,
    storeRegion: row.stores?.region ?? null,
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
    .select("id, name, city, region, walk_in_enabled")
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

/** Turns walk-in trading on or off for a store. */
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
