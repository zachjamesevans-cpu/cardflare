import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { EventRow } from "@/lib/supabase/types";
import { generateJoinCode } from "./join-code";
import type { CreateEventInput, EventStatus, PublicEvent } from "./schema";

const UNIQUE_VIOLATION = "23505";

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
 * Resolves a join code for the public join page.
 *
 * Selects an explicit column list rather than `*`: this result is rendered to
 * anyone holding the code, and `select()` would quietly start returning any
 * column a later migration adds.
 */
export async function findEventByJoinCode(code: string): Promise<PublicEvent | null> {
  if (!canQuery("resolve the join code")) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("events")
    .select("id, name, status, starts_at, ends_at, stores(name, city, region)")
    .eq("join_code", code)
    .maybeSingle();

  if (error) {
    console.error("Could not resolve the join code", error);
    return null;
  }
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    name: string;
    status: EventStatus;
    starts_at: string;
    ends_at: string;
    stores: { name: string; city: string | null; region: string | null } | null;
  };

  return {
    id: row.id,
    name: row.name,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    storeName: row.stores?.name ?? "A CardFlare store",
    storeCity: row.stores?.city ?? null,
    storeRegion: row.stores?.region ?? null,
  };
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
