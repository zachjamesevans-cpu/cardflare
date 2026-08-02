import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicEvent, PublicStore } from "@/lib/events/schema";

/**
 * Where a scanned code leads.
 *
 * A store prints one sheet and leaves it up for a year, so this module has to
 * be right on evenings nobody planned for. The case worth protecting above all
 * the others is the first one below: a counter code must never open a second
 * room beside a running event. Splitting a room in half is the one failure
 * this feature cannot have, because the product is "find the person in this
 * room who has your card" and two half-rooms answer that wrongly while looking
 * like they worked.
 *
 * The repository is mocked so the decisions are visible; the SQL underneath is
 * verified separately against a real PostgreSQL instance.
 */

const findEventByJoinCode = vi.fn();
const findStoreByJoinCode = vi.fn();
const findRunningScheduledEvent = vi.fn();
const findOpenWalkInRoom = vi.fn();
const latestActivityAt = vi.fn();
const closeWalkInRoom = vi.fn();
const openWalkInRoom = vi.fn();

vi.mock("@/lib/events/repository", () => ({
  findEventByJoinCode: (...args: unknown[]) => findEventByJoinCode(...args),
  findStoreByJoinCode: (...args: unknown[]) => findStoreByJoinCode(...args),
  findRunningScheduledEvent: (...args: unknown[]) => findRunningScheduledEvent(...args),
  findOpenWalkInRoom: (...args: unknown[]) => findOpenWalkInRoom(...args),
  latestActivityAt: (...args: unknown[]) => latestActivityAt(...args),
  closeWalkInRoom: (...args: unknown[]) => closeWalkInRoom(...args),
  openWalkInRoom: (...args: unknown[]) => openWalkInRoom(...args),
}));

const {
  resolveCode,
  enterRoomByCode,
  endWalkInRoom,
  isIdle,
  WALK_IN_IDLE_MS,
  DOORS_OPEN_LEAD_MS,
} = await import("@/lib/events/rooms");

const STORE_CODE = "K3M9PZQ";
const EVENT_CODE = "K3M9PZ";

/*
 * The clock is frozen for every test in this file.
 *
 * Not a tidiness preference — with a live clock the fixtures below compute
 * their timestamps a millisecond apart from the ones the assertions build, and
 * the suite fails a different test on every third run. Freezing also lets the
 * idle-window assertions land exactly on the boundary instead of near it.
 */
const NOW = Date.parse("2026-09-11T19:00:00.000Z");

const store = (over: Partial<PublicStore> = {}): PublicStore => ({
  id: "store-1",
  name: "Grand Line Games",
  city: "Austin",
  region: "TX",
  walkInEnabled: true,
  ...over,
});

const minutesAgo = (n: number) => new Date(NOW - n * 60 * 1000).toISOString();

const room = (over: Partial<PublicEvent> = {}): PublicEvent => ({
  id: "room-1",
  name: "Walk-in trading",
  kind: "walk_in",
  status: "open",
  startsAt: minutesAgo(60),
  endsAt: null,
  storeName: "Grand Line Games",
  storeCity: "Austin",
  storeRegion: "TX",
  ...over,
});

const scheduled = (over: Partial<PublicEvent> = {}): PublicEvent =>
  room({
    id: "event-1",
    name: "Friday Locals",
    kind: "scheduled",
    endsAt: minutesAgo(-60),
    ...over,
  });

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);

  for (const fn of [
    findEventByJoinCode,
    findStoreByJoinCode,
    findRunningScheduledEvent,
    findOpenWalkInRoom,
    latestActivityAt,
    closeWalkInRoom,
    openWalkInRoom,
  ]) {
    fn.mockReset();
  }

  findEventByJoinCode.mockResolvedValue(null);
  findStoreByJoinCode.mockResolvedValue(null);
  findRunningScheduledEvent.mockResolvedValue(null);
  findOpenWalkInRoom.mockResolvedValue(null);
  latestActivityAt.mockResolvedValue(null);
  closeWalkInRoom.mockResolvedValue(true);
});

describe("resolveCode", () => {
  it("does not recognise a code that is neither length", async () => {
    for (const code of ["K3M9P", "K3M9PZQ8", "", "k3m9pz"]) {
      await expect(resolveCode(code)).resolves.toEqual({ outcome: "not-found" });
    }

    expect(findEventByJoinCode).not.toHaveBeenCalled();
    expect(findStoreByJoinCode).not.toHaveBeenCalled();
  });

  it("sends a six-character code to the events table and nowhere else", async () => {
    findEventByJoinCode.mockResolvedValue(scheduled());

    const result = await resolveCode(EVENT_CODE);

    expect(result).toEqual({ outcome: "room", room: scheduled() });
    expect(findStoreByJoinCode).not.toHaveBeenCalled();
  });

  it("sends a seven-character code to the stores table and nowhere else", async () => {
    findStoreByJoinCode.mockResolvedValue(store());

    await resolveCode(STORE_CODE);

    expect(findStoreByJoinCode).toHaveBeenCalledWith(STORE_CODE);
    expect(findEventByJoinCode).not.toHaveBeenCalled();
  });

  it("reports an unknown store code as not found", async () => {
    await expect(resolveCode(STORE_CODE)).resolves.toEqual({ outcome: "not-found" });
  });

  /*
   * The whole reason this module exists. On tournament night the counter code
   * has to put everybody in the tournament, not open a rival room beside it.
   */
  it("puts a counter scan into the running event rather than a walk-in room", async () => {
    findStoreByJoinCode.mockResolvedValue(store());
    findRunningScheduledEvent.mockResolvedValue(scheduled());
    findOpenWalkInRoom.mockResolvedValue(room());

    const result = await resolveCode(STORE_CODE);

    expect(result).toEqual({ outcome: "room", room: scheduled() });
    expect(findOpenWalkInRoom).not.toHaveBeenCalled();
  });

  /*
   * Players turn up before doors. Without the lead time the early arrivals
   * would be put in the walk-in room and everybody after the start time in the
   * event — the same split, caused by the clock instead of by a race.
   */
  it("lets an event claim the counter code before it starts", async () => {
    findStoreByJoinCode.mockResolvedValue(store());

    await resolveCode(STORE_CODE);

    const [, startsBefore, endsAfter] = findRunningScheduledEvent.mock.calls[0];
    const lead = Date.parse(startsBefore as string) - Date.parse(endsAfter as string);

    expect(lead).toBe(DOORS_OPEN_LEAD_MS);
  });

  it("asks only for events that have not finished yet", async () => {
    findStoreByJoinCode.mockResolvedValue(store());

    await resolveCode(STORE_CODE);

    const [, , endsAfter] = findRunningScheduledEvent.mock.calls[0];

    expect(Date.parse(endsAfter as string)).toBe(NOW);
  });

  it("keeps a walk-in room that somebody was in a moment ago", async () => {
    findStoreByJoinCode.mockResolvedValue(store());
    findOpenWalkInRoom.mockResolvedValue(room());
    latestActivityAt.mockResolvedValue(minutesAgo(20));

    const result = await resolveCode(STORE_CODE);

    expect(result).toEqual({ outcome: "room", room: room() });
    expect(closeWalkInRoom).not.toHaveBeenCalled();
  });

  /*
   * A slow Tuesday is still one afternoon of trading. Somebody who posted a
   * Flare at eleven and somebody who arrives at four should see each other.
   */
  it("keeps a walk-in room across a long quiet stretch", async () => {
    findStoreByJoinCode.mockResolvedValue(store());
    findOpenWalkInRoom.mockResolvedValue(room());
    latestActivityAt.mockResolvedValue(minutesAgo(5 * 60));

    const result = await resolveCode(STORE_CODE);

    expect(result).toMatchObject({ outcome: "room" });
  });

  it("closes a walk-in room that has gone quiet, and offers a fresh start", async () => {
    findStoreByJoinCode.mockResolvedValue(store());
    findOpenWalkInRoom.mockResolvedValue(room({ id: "stale" }));
    latestActivityAt.mockResolvedValue(minutesAgo(7 * 60));

    const result = await resolveCode(STORE_CODE);

    expect(closeWalkInRoom).toHaveBeenCalledWith("stale", expect.any(String));
    expect(result).toEqual({ outcome: "lobby", store: store() });
  });

  /*
   * Not "now". A room found stale on Sunday stopped being used on Friday, and
   * stamping Sunday would tell the store it ran for two days.
   */
  it("finishes a stale room when trading actually stopped", async () => {
    const lastSeen = minutesAgo(9 * 60);

    findStoreByJoinCode.mockResolvedValue(store());
    findOpenWalkInRoom.mockResolvedValue(room({ startsAt: minutesAgo(11 * 60) }));
    latestActivityAt.mockResolvedValue(lastSeen);

    await resolveCode(STORE_CODE);

    expect(closeWalkInRoom).toHaveBeenCalledWith("room-1", lastSeen);
  });

  /*
   * A room nobody ever joined still has to age out, or it stays open forever
   * holding the one-open-room slot.
   */
  it("ages out a room nobody ever joined, measured from when it opened", async () => {
    findStoreByJoinCode.mockResolvedValue(store());
    findOpenWalkInRoom.mockResolvedValue(room({ startsAt: minutesAgo(8 * 60) }));
    latestActivityAt.mockResolvedValue(null);

    const result = await resolveCode(STORE_CODE);

    expect(closeWalkInRoom).toHaveBeenCalled();
    expect(result).toMatchObject({ outcome: "lobby" });
  });

  it("says a store with walk-in trading off is quiet", async () => {
    findStoreByJoinCode.mockResolvedValue(store({ walkInEnabled: false }));

    const result = await resolveCode(STORE_CODE);

    expect(result).toEqual({
      outcome: "quiet",
      store: store({ walkInEnabled: false }),
    });
  });

  /*
   * Turning the switch off must not leave a room running behind it: open
   * forever, reachable by nobody, and shown to the store as still going.
   */
  it("closes a room left behind by a store that switched walk-in off", async () => {
    findStoreByJoinCode.mockResolvedValue(store({ walkInEnabled: false }));
    findOpenWalkInRoom.mockResolvedValue(room({ id: "orphan" }));
    latestActivityAt.mockResolvedValue(minutesAgo(5));

    const result = await resolveCode(STORE_CODE);

    expect(closeWalkInRoom).toHaveBeenCalledWith("orphan", expect.any(String));
    expect(result).toMatchObject({ outcome: "quiet" });
  });

  /*
   * A scheduled event still runs even with walk-in trading switched off — the
   * switch governs the quiet afternoons, not the store's own events.
   */
  it("still runs a scheduled event for a store with walk-in off", async () => {
    findStoreByJoinCode.mockResolvedValue(store({ walkInEnabled: false }));
    findRunningScheduledEvent.mockResolvedValue(scheduled());

    const result = await resolveCode(STORE_CODE);

    expect(result).toEqual({ outcome: "room", room: scheduled() });
  });

  /*
   * Looking at a page must not create anything. Somebody glancing at the
   * counter code on the way past would otherwise leave an empty session in the
   * store's history whose start time is a lie.
   */
  it("never opens a room", async () => {
    findStoreByJoinCode.mockResolvedValue(store());

    await resolveCode(STORE_CODE);

    expect(openWalkInRoom).not.toHaveBeenCalled();
  });
});

describe("enterRoomByCode", () => {
  it("opens the walk-in room when somebody actually joins", async () => {
    findStoreByJoinCode.mockResolvedValue(store());
    openWalkInRoom.mockResolvedValue({ outcome: "opened", room: room({ id: "new" }) });

    const entered = await enterRoomByCode(STORE_CODE);

    expect(openWalkInRoom).toHaveBeenCalledWith("store-1", expect.any(String));
    expect(entered).toMatchObject({ id: "new" });
  });

  it("joins the running event instead of opening anything", async () => {
    findStoreByJoinCode.mockResolvedValue(store());
    findRunningScheduledEvent.mockResolvedValue(scheduled());

    await expect(enterRoomByCode(STORE_CODE)).resolves.toEqual(scheduled());
    expect(openWalkInRoom).not.toHaveBeenCalled();
  });

  /*
   * Two players scanning the counter at the same moment. The database allows
   * one open walk-in room per store, so the loser adopts the winner's room
   * rather than failing — from the players' side both taps land in one place.
   */
  it("adopts the other room when two scans race", async () => {
    findStoreByJoinCode.mockResolvedValue(store());
    openWalkInRoom.mockResolvedValue({ outcome: "raced" });
    findOpenWalkInRoom
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(room({ id: "winner" }));

    await expect(enterRoomByCode(STORE_CODE)).resolves.toMatchObject({
      id: "winner",
    });
  });

  it("refuses to open a room for a store with walk-in trading off", async () => {
    findStoreByJoinCode.mockResolvedValue(store({ walkInEnabled: false }));

    await expect(enterRoomByCode(STORE_CODE)).resolves.toBeNull();
    expect(openWalkInRoom).not.toHaveBeenCalled();
  });

  it("resolves an event code without touching the store path", async () => {
    findEventByJoinCode.mockResolvedValue(scheduled());

    await expect(enterRoomByCode(EVENT_CODE)).resolves.toEqual(scheduled());
    expect(openWalkInRoom).not.toHaveBeenCalled();
  });

  it("does not recognise a malformed code", async () => {
    await expect(enterRoomByCode("nope")).resolves.toBeNull();
  });
});

describe("isIdle", () => {
  it("holds the room right up to the window, and not a moment past it", () => {
    expect(isIdle(new Date(NOW - WALK_IN_IDLE_MS).toISOString(), NOW)).toBe(false);
    expect(isIdle(new Date(NOW - WALK_IN_IDLE_MS - 1).toISOString(), NOW)).toBe(true);
  });

  /*
   * Longer than a store's closing hours, so an overnight gap always starts a
   * fresh room and nobody walks in to yesterday's Flares.
   */
  it("is long enough to span a slow day and short enough to break a night", () => {
    expect(WALK_IN_IDLE_MS).toBeGreaterThan(4 * 60 * 60 * 1000);
    expect(WALK_IN_IDLE_MS).toBeLessThan(12 * 60 * 60 * 1000);
  });
});

describe("endWalkInRoom", () => {
  /*
   * `ends_at > starts_at` is a check constraint. A room nobody ever joined has
   * its last activity *at* its start, which would violate it and leave the
   * room open forever — the exact state the idle sweep exists to clear.
   */
  it("never stamps a finish at or before the start", async () => {
    const startsAt = minutesAgo(0);

    await endWalkInRoom("room-1", startsAt, startsAt);

    const [, endedAt] = closeWalkInRoom.mock.calls[0];

    expect(Date.parse(endedAt as string)).toBeGreaterThan(Date.parse(startsAt));
  });

  it("keeps the real finish when there was one", async () => {
    const startsAt = minutesAgo(300);
    const lastSeen = minutesAgo(90);

    await endWalkInRoom("room-1", startsAt, lastSeen);

    expect(closeWalkInRoom).toHaveBeenCalledWith("room-1", lastSeen);
  });
});
