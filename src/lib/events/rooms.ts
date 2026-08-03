import "server-only";

import { classifyCode } from "./join-code";
import {
  closeWalkInRoom,
  findEventByJoinCode,
  findOpenWalkInRoom,
  findRunningScheduledEvent,
  findShowByJoinCode,
  findStoreByJoinCode,
  latestActivityAt,
  openWalkInRoom,
} from "./repository";
import type { CodeResolution, PublicEvent, PublicStore } from "./schema";

/**
 * Where a scanned code leads.
 *
 * A store prints one sheet and leaves it on the counter for a year. Everything
 * here exists to make that one code behave sensibly on every kind of evening:
 * a tournament, a quiet Tuesday, and the Wednesday the store decided it did
 * not want walk-in trading at all.
 *
 * The rule that matters most is that a store code never opens a *second* room
 * next to a running event. Splitting the room is the one failure this feature
 * cannot have — the whole product is "find the person in this room who has
 * your card", and two half-rooms at one counter answers that question wrongly
 * while looking like it worked.
 */

/**
 * How long a walk-in room survives with nobody in it.
 *
 * Deliberately much longer than the fifteen-minute presence window. Presence
 * answers "who is standing here now"; this answers "is this still the same
 * afternoon of trading". Someone who posts a Flare at eleven and someone who
 * arrives at four should land in the same room and see each other's cards —
 * for a store, that continuity across a slow day is the point.
 *
 * Six hours also means an overnight gap always starts a fresh room, so nobody
 * ever walks in to a board of yesterday's Flares. Every store's opening hours
 * are shorter than the gap between closing and opening again.
 */
export const WALK_IN_IDLE_MS = 6 * 60 * 60 * 1000;

/**
 * How early a scheduled event claims the counter code.
 *
 * Players turn up before doors. Without a lead time the early arrivals would
 * be put in the walk-in room and everybody after the start time in the event —
 * the split this module exists to prevent, caused by the clock rather than by
 * a race.
 */
export const DOORS_OPEN_LEAD_MS = 2 * 60 * 60 * 1000;

/** True once a room has been quiet for longer than the idle window. */
export function isIdle(
  lastActivityAt: string,
  now: number,
  idleMs: number = WALK_IN_IDLE_MS,
): boolean {
  return now - new Date(lastActivityAt).getTime() > idleMs;
}

/**
 * The room a store's code should open right now, without starting one.
 *
 * Reading a page must not create a room. Someone glancing at the counter code
 * on the way past would otherwise leave an empty session in the store's
 * history, and its start time would be a lie — trading did not begin when a
 * stranger looked at a QR code. The room is opened by `enterRoomByCode`, at
 * the moment somebody actually joins.
 *
 * Closing a stale room here *is* a write, and belongs here: it is cleanup that
 * has to happen before anybody can be told what is running, and it is
 * idempotent under the `status = 'open'` guard.
 */
async function findLiveRoom(store: PublicStore): Promise<PublicEvent | null> {
  const now = Date.now();

  const scheduled = await findRunningScheduledEvent(
    store.id,
    new Date(now + DOORS_OPEN_LEAD_MS).toISOString(),
    new Date(now).toISOString(),
  );

  if (scheduled) return scheduled;

  const walkIn = await findOpenWalkInRoom(store.id);
  if (!walkIn) return null;

  /*
   * An empty room is measured from when it opened, so one that nobody ever
   * joined still ages out instead of staying open forever.
   */
  const lastActivity = (await latestActivityAt(walkIn.id)) ?? walkIn.startsAt;

  /*
   * A room left open by a store that has since switched walk-in trading off is
   * closed here rather than left running. The switch is checked *after* the
   * room is looked up for exactly this reason: returning early on the switch
   * alone would orphan the room — open forever, reachable by nobody, and shown
   * to the store as still running.
   */
  if (store.walkInEnabled && !isIdle(lastActivity, now)) return walkIn;

  await endWalkInRoom(walkIn.id, walkIn.startsAt, lastActivity);
  return null;
}

/**
 * Closes a walk-in room, finishing it when trading actually stopped.
 *
 * Not "now": a room found stale on Sunday stopped being used on Friday night,
 * and stamping Sunday would tell the store it ran for two days. The floor of
 * one second past the start is what keeps `ends_at > starts_at` satisfied for
 * a room that nobody ever joined, where the last activity *is* the start.
 */
export async function endWalkInRoom(
  roomId: string,
  startsAt: string,
  endedAt: string,
): Promise<void> {
  const stamp = Math.max(
    new Date(endedAt).getTime(),
    new Date(startsAt).getTime() + 1000,
  );

  await closeWalkInRoom(roomId, new Date(stamp).toISOString());
}

/** Ends a walk-in room at the moment the last person was seen in it. */
export async function endWalkInRoomWhenLastUsed(room: {
  id: string;
  startsAt: string;
}): Promise<void> {
  const lastActivity = (await latestActivityAt(room.id)) ?? room.startsAt;
  await endWalkInRoom(room.id, room.startsAt, lastActivity);
}

/**
 * Resolves any code a player arrived with, for rendering.
 *
 * Never opens a walk-in room; see `findLiveRoom`.
 */
export async function resolveCode(code: string): Promise<CodeResolution> {
  const kind = classifyCode(code);
  if (!kind) return { outcome: "not-found" };

  if (kind === "event") {
    const room = await findEventByJoinCode(code);
    return room ? { outcome: "room", room } : { outcome: "not-found" };
  }

  // A show is a place to look things up, never a room to enter — the page
  // renders search, and no participation row is ever written against it.
  if (kind === "show") {
    const show = await findShowByJoinCode(code);
    return show ? { outcome: "show", show } : { outcome: "not-found" };
  }

  const store = await findStoreByJoinCode(code);
  if (!store) return { outcome: "not-found" };

  const room = await findLiveRoom(store);
  if (room) return { outcome: "room", room };

  return { outcome: store.walkInEnabled ? "lobby" : "quiet", store };
}

/**
 * Resolves a code to the room a player is joining, opening one if that is what
 * the code means.
 *
 * The write-path twin of `resolveCode`, used only when somebody has actually
 * submitted the join form. Everything is re-established here rather than
 * trusted from the page that rendered the form: a Server Action is a public
 * POST endpoint, and the store may have switched walk-in trading off in the
 * meantime.
 */
export async function enterRoomByCode(code: string): Promise<PublicEvent | null> {
  const kind = classifyCode(code);
  if (!kind) return null;

  if (kind === "event") return findEventByJoinCode(code);

  // Shows have no join path at all: nothing to enter, nothing to open.
  if (kind === "show") return null;

  const store = await findStoreByJoinCode(code);
  if (!store) return null;

  const live = await findLiveRoom(store);
  if (live) return live;

  /*
   * Re-checked at the moment of joining, not when the page rendered. The store
   * can flip the switch while somebody is looking at the join form.
   */
  if (!store.walkInEnabled) return null;

  const opened = await openWalkInRoom(store.id, new Date().toISOString());

  /*
   * Two players scanning the counter at the same moment both found no room and
   * both tried to open one. The database allows exactly one, so the loser
   * takes the winner's room rather than reporting a failure — from the
   * players' side the two taps simply put them both in the same place.
   */
  if (opened.outcome === "raced") return findOpenWalkInRoom(store.id);

  return opened.room;
}
