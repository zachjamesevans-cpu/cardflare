import "server-only";

import { earlyBoardOpensAt } from "@/lib/events/schema";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * Your locals: the stores a player actually goes to.
 *
 * Nobody manages this list either — the same sleight of hand as wants.
 * Joining a room while signed in saves the store; from then on it is
 * reachable without a QR code, with its next event and live board a tap
 * away. Removal exists for the store you visited once on vacation.
 *
 * Saving never throws and never blocks a join: a player standing at a
 * counter must get into the room even if this bookkeeping write fails.
 */

export interface LocalStore {
  storeId: string;
  name: string;
  city: string | null;
  region: string | null;
  /** The store's permanent counter code — how a local is entered without a QR. */
  joinCode: string;
  savedAt: string;
  /** True when a room is open at this store right now. */
  liveNow: boolean;
  /** The next scheduled event's start, if one is on the calendar. */
  nextEventAt: string | null;
  nextEventName: string | null;
  /** The next event's own code, for walking straight onto its board. */
  nextEventCode: string | null;
  /** True when the next event's board is already taking Flares. */
  earlyOpen: boolean;
}

/** Remembers that this player goes to this store. Idempotent, silent. */
export async function saveLocal(playerId: string, storeId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const { error } = await getSupabaseAdmin()
    .from("player_locals")
    .upsert(
      { player_id: playerId, store_id: storeId },
      { onConflict: "player_id,store_id", ignoreDuplicates: true },
    );

  if (error) console.error("Could not save the local store", error);
}

export async function removeLocal(playerId: string, storeId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const { error } = await getSupabaseAdmin()
    .from("player_locals")
    .delete()
    .eq("player_id", playerId)
    .eq("store_id", storeId);

  if (error) console.error("Could not remove the local store", error);
}

/** The player's saved stores, newest first, each with its current pulse. */
/**
 * Turns a set of store ids into what the Feed needs to know about them.
 *
 * Extracted so "the stores I saved" and "the stores with something on
 * right now" derive their boards identically. They are the same
 * question asked from two directions, and two copies of this would drift
 * the moment one of them learned about a new event status.
 */
async function boardsForStores(
  storeIds: string[],
  savedAt: Map<string, string>,
): Promise<LocalStore[]> {
  if (storeIds.length === 0) return [];

  const [{ data: stores }, { data: events }] = await Promise.all([
    getSupabaseAdmin()
      .from("stores")
      .select("id, name, city, region, join_code, early_board_hours, timezone")
      .in("id", storeIds),
    /*
     * One query answers both "is a room live right now" (status open) and
     * "what is next on the calendar" (draft, in the future). Closed rooms
     * are history and stay out of it.
     */
    getSupabaseAdmin()
      .from("events")
      .select("store_id, name, status, starts_at, join_code")
      .in("store_id", storeIds)
      .neq("status", "closed"),
  ]);

  const byStore = new Map((stores ?? []).map((store) => [store.id, store]));
  const now = Date.now();

  const live = new Set<string>();
  const next = new Map<
    string,
    { name: string; startsAt: string; joinCode: string | null }
  >();
  for (const event of events ?? []) {
    if (event.status === "open") live.add(event.store_id);
    if (event.status === "draft" && Date.parse(event.starts_at) > now) {
      const current = next.get(event.store_id);
      if (!current || event.starts_at < current.startsAt) {
        next.set(event.store_id, {
          name: event.name,
          startsAt: event.starts_at,
          joinCode: event.join_code,
        });
      }
    }
  }

  return storeIds.flatMap((storeId) => {
    const store = byStore.get(storeId);
    if (!store) return [];

    const upcoming = next.get(storeId) ?? null;

    // The board is already open when the start is inside the store's
    // early window — or when it is already event day, the founder's
    // midnight rule; that is when "I'll be there" earns a button.
    const opensAt = upcoming
      ? earlyBoardOpensAt({
          startsAt: upcoming.startsAt,
          earlyBoardHours: store.early_board_hours,
          storeTimeZone: store.timezone,
        })
      : null;
    const earlyOpen = Boolean(
      upcoming && upcoming.joinCode && opensAt !== null && opensAt <= now,
    );

    return [
      {
        storeId: store.id,
        name: store.name,
        city: store.city,
        region: store.region,
        joinCode: store.join_code,
        savedAt: savedAt.get(storeId) ?? "",
        liveNow: live.has(store.id),
        nextEventAt: upcoming?.startsAt ?? null,
        nextEventName: upcoming?.name ?? null,
        nextEventCode: upcoming?.joinCode ?? null,
        earlyOpen,
      },
    ];
  });
}

export async function listLocals(playerId: string): Promise<LocalStore[]> {
  if (!isSupabaseConfigured()) return [];

  const { data: rows, error } = await getSupabaseAdmin()
    .from("player_locals")
    .select("store_id, created_at")
    .eq("player_id", playerId)
    .order("created_at", { ascending: false });

  if (error || !rows || rows.length === 0) {
    if (error) console.error("Could not list the player's locals", error);
    return [];
  }

  return boardsForStores(
    rows.map((row) => row.store_id),
    new Map(rows.map((row) => [row.store_id, row.created_at])),
  );
}

/**
 * Stores with something on right now, anywhere.
 *
 * The Feed's answer to a brand-new player. Every other item is
 * personalised — a friend's hunt, a saved store's board, a trade where
 * you play — so on day one they all return nothing and the feed is
 * empty. This one needs nothing from the player at all: a room open
 * tonight is news whether or not they have told us anything.
 *
 * Honest at pilot scale precisely because the list is short. When there
 * are eight stores, "every store with something on" IS the nearby list;
 * when there are eight hundred it stops being one, and that is the
 * moment to ask a player where they play rather than guess.
 */
export async function listOpenStores(
  exclude: string[] = [],
  limit = 3,
): Promise<LocalStore[]> {
  if (!isSupabaseConfigured()) return [];

  /* Started from the EVENTS, not the stores: a shop with nothing on is
     not news, and scanning every store to discover that would be a
     query whose answer is almost always "no". */
  const { data: events, error } = await getSupabaseAdmin()
    .from("events")
    .select("store_id, starts_at")
    .neq("status", "closed")
    .order("starts_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("Could not look for open rooms", error);
    return [];
  }

  const skip = new Set(exclude);
  const candidates = [
    ...new Set(
      (events ?? []).map((event) => event.store_id).filter((id) => !skip.has(id)),
    ),
  ];

  const boards = await boardsForStores(candidates, new Map());

  /* Only the ones somebody could actually walk into or post onto, and a
     room open NOW before a board opening later. */
  return boards
    .filter((store) => store.liveNow || store.earlyOpen)
    .sort((a, b) => Number(b.liveNow) - Number(a.liveNow))
    .slice(0, limit);
}
