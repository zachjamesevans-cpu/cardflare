import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { roomPhase } from "@/lib/events/schema";
import {
  addDays,
  dayChipLabel,
  dayInWords,
  dayWindow,
  goingToStoreLine,
  planDates,
  weekdayOf,
} from "@/lib/events/store-day-rules";

/**
 * Store days: the store is the room and a day is the time. The founder
 * (2026-10-09): "I miss the simplicity of just getting into a room."
 */

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const spoken = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the week on offer", () => {
  it("is today and the six days after it, across a month end", () => {
    expect(planDates("2026-10-29")).toEqual([
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
    ]);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("names the days the way a person says them", () => {
    expect(weekdayOf("2026-10-16")).toBe(5);
    expect(dayChipLabel("2026-10-14", "2026-10-14")).toBe("Today");
    expect(dayChipLabel("2026-10-15", "2026-10-14")).toBe("Tomorrow");
    expect(dayChipLabel("2026-10-16", "2026-10-14")).toBe("Fri 16");
    expect(dayInWords("2026-10-16", "2026-10-14")).toBe("Friday");
    expect(goingToStoreLine("Mox", "2026-10-16", "2026-10-14")).toBe(
      "You're going to Mox on Friday.",
    );
    expect(goingToStoreLine("Mox", "2026-10-14", "2026-10-14")).toBe(
      "You're going to Mox today.",
    );
  });
});

describe("a store's hours on a day", () => {
  const hours = [
    null,
    { open: "12:00", close: "20:00" },
    { open: "12:00", close: "20:00" },
    { open: "12:00", close: "20:00" },
    { open: "12:00", close: "20:00" },
    { open: "16:00", close: "01:00" },
    { open: "10:00", close: "22:00" },
  ];

  it("is closed on a day the store says it is closed", () => {
    expect(dayWindow(hours, "2026-10-18")).toBeNull();
  });

  it("reads past midnight as the next day", () => {
    expect(dayWindow(hours, "2026-10-16")).toEqual({
      open: "16:00",
      close: "01:00",
      closesNextDay: true,
    });
  });

  it("falls back to the defaults for a store that has not said", () => {
    expect(dayWindow(null, "2026-10-16")).toEqual({
      open: "11:00",
      close: "22:00",
      closesNextDay: false,
    });
  });
});

describe("a day room's phase", () => {
  const room = {
    kind: "day" as const,
    status: "open" as const,
    startsAt: "2026-10-16T17:00:00Z",
    endsAt: "2026-10-17T03:00:00Z",
    earlyBoardHours: 48,
    storeTimeZone: "America/Chicago",
  };

  it("opens and closes on the clock, with no store to press Open", () => {
    expect(roomPhase(room, Date.parse("2026-10-14T12:00:00Z"))).toBe("upcoming");
    expect(roomPhase(room, Date.parse("2026-10-16T18:00:00Z"))).toBe("live");
    expect(roomPhase(room, Date.parse("2026-10-17T04:00:00Z"))).toBe("finished");
    expect(
      roomPhase({ ...room, status: "closed" }, Date.parse("2026-10-16T18:00:00Z")),
    ).toBe("finished");
  });
});

describe("one room per store at a time", () => {
  const rooms = spoken(read("src/lib/events/rooms.ts"));

  it("puts a counter scan in the day room before opening a walk-in room", () => {
    const find = rooms.slice(rooms.indexOf("async function findLiveRoom("));
    const scheduled = find.indexOf("findRunningScheduledEvent(");
    const day = find.indexOf("findRunningDayRoom(");
    const walkIn = find.indexOf("findOpenWalkInRoom(");
    expect(scheduled).toBeGreaterThan(-1);
    expect(day).toBeGreaterThan(scheduled);
    expect(walkIn).toBeGreaterThan(day);
  });

  it("ends day rooms with the nights, debts and all", () => {
    expect(read("src/lib/events/repository.ts")).toContain(
      '.in("kind", ["scheduled", "day"])',
    );
  });

  it("plans into what is already there: the store's night, today's room, then a day room", () => {
    const days = spoken(read("src/lib/events/store-days.ts"));
    const plan = days.slice(days.indexOf("export async function planVisit("));
    expect(plan).toContain("const room = rooms.get(date);");
    expect(plan).toContain(
      'if (!store.walk_in_enabled) return { ok: false, reason: "no-open-trading" };',
    );
    expect(plan).toContain(
      "setGoing(eventId, playerId, displayName, true, deviceSession)",
    );
    const byDate = days.slice(days.indexOf("async function roomsByDate("));
    expect(byDate).toContain("liveRoomForStore(counter)");
  });
});

describe("you're here", () => {
  const days = spoken(read("src/lib/events/store-days.ts"));
  const here = days.slice(
    days.indexOf("export async function storeHere("),
    days.indexOf("export async function saveStoreLocation("),
  );

  it("compares the position once and writes nothing", () => {
    expect(here).not.toMatch(/\.insert\(|\.update\(|\.upsert\(/);
    expect(here).toContain("if (meters > HERE_RADIUS_METERS) continue;");
  });

  it("is throttled on the app's door and the website's", () => {
    expect(read("src/app/api/v1/stores/here/route.ts")).toContain("tooMany(");
    expect(read("src/lib/events/store-day-actions.ts")).toContain("store-here:");
  });

  it("lets only the store's own staff set its pin", () => {
    const actions = read("src/lib/events/actions.ts");
    const save = actions.slice(
      actions.indexOf("export async function saveStoreLocationAction("),
    );
    expect(save).toContain("const actor = await authorizeStore(storeId);");
    expect(save).toContain("if (!actor) return { ok: false };");
  });
});

describe("the table", () => {
  const migration = read("supabase/migrations/20261111090000_store_days.sql");

  it("adds the kind outside the transaction and never uses it as a literal inside", () => {
    expect(migration.indexOf("add value if not exists 'day'")).toBeLessThan(
      migration.indexOf("begin;"),
    );
    expect(migration).toContain("(kind::text = 'day') = (plan_day is not null)");
  });

  it("keeps one day room per store per date", () => {
    expect(migration).toContain("on public.events (store_id, plan_day)");
    expect(migration).toContain("where plan_day is not null");
  });
});
