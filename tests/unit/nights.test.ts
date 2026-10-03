import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { goingLine } from "@/lib/events/going-copy";
import { orderNights } from "@/lib/events/nights";
import {
  boardReadable,
  boardWritable,
  roomPhase,
  type RoomPhase,
} from "@/lib/events/schema";

/**
 * Nights, round 1: the server half, pinned.
 *
 * The founder: "Rooms open the moment a store posts a night. One tap,
 * Going, puts you on the roster with your Flares and trade binders.
 * Anyone signed in can browse who is going and what they want. Matches
 * ping you before the night. The Room tab becomes Nights."
 *
 * What is pinned here is the part the two clients build against: the
 * phase rules, the two board gates, the count line, the notification
 * kind reaching the database, the dedupe keys, the routes existing,
 * the feed's new fields, and the Nights list's order.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const HOUR = 60 * 60 * 1000;
const now = Date.parse("2026-10-03T18:00:00Z");

function draft(startsInMs: number, earlyBoardHours: number) {
  return {
    kind: "scheduled" as const,
    status: "draft" as const,
    startsAt: new Date(now + startsInMs).toISOString(),
    endsAt: new Date(now + startsInMs + 4 * HOUR).toISOString(),
    earlyBoardHours,
    storeTimeZone: "UTC",
  };
}

describe("the phase rules", () => {
  it("a posted night ahead of its early window is upcoming", () => {
    expect(roomPhase(draft(10 * 24 * HOUR, 48), now)).toBe("upcoming");
  });

  it("a night with early boards off is upcoming until it starts", () => {
    expect(roomPhase(draft(30 * 60 * 1000, 0), now)).toBe("upcoming");
  });

  it("inside the early window is early, unchanged", () => {
    expect(roomPhase(draft(24 * HOUR, 48), now)).toBe("early");
  });

  it("a start that passed without the store opening it is pending", () => {
    expect(roomPhase(draft(-2 * HOUR, 0), now)).toBe("pending");
    expect(roomPhase(draft(-30 * HOUR, 48), now)).toBe("pending");
  });

  it("open is live and closed is finished, whatever the clock says", () => {
    expect(roomPhase({ ...draft(-2 * HOUR, 0), status: "open" }, now)).toBe("live");
    expect(roomPhase({ ...draft(5 * HOUR, 0), status: "closed" }, now)).toBe(
      "finished",
    );
  });

  it("the board reads and writes in upcoming, early and live", () => {
    const open: RoomPhase[] = ["upcoming", "early", "live"];
    const shut: RoomPhase[] = ["pending", "finished"];
    expect(open.every(boardReadable)).toBe(true);
    expect(open.every(boardWritable)).toBe(true);
    expect(shut.some(boardReadable)).toBe(false);
    expect(shut.some(boardWritable)).toBe(false);
  });

  it("every door uses the gate rather than naming phases", () => {
    for (const path of [
      "src/lib/events/join-event-actions.ts",
      "src/app/api/v1/rooms/[code]/route.ts",
      "src/app/api/v1/rooms/[code]/flares/route.ts",
      "src/app/api/v1/rooms/[code]/offers/route.ts",
    ]) {
      expect(read(path), path).toContain("boardWritable(");
    }
    expect(read("src/app/api/v1/rooms/[code]/route.ts")).toContain(
      "boardReadable(phase)",
    );
  });
});

describe("the count line", () => {
  it("reads Nobody going yet, 1 going, n going", () => {
    expect(goingLine(0)).toBe("Nobody going yet");
    expect(goingLine(1)).toBe("1 going");
    expect(goingLine(12)).toBe("12 going");
  });

  it("the web copy has no server-only import, so clients can read it", () => {
    expect(read("src/lib/events/going-copy.ts")).not.toContain('import "server-only"');
  });
});

describe("the night-match notice", () => {
  const migrations = join(process.cwd(), "supabase/migrations");
  const sql = readdirSync(migrations)
    .sort()
    .map((file) => readFileSync(join(migrations, file), "utf8"))
    .join("\n");

  it("reached the database's kind list, last", () => {
    const blocks = [
      ...sql.matchAll(/notifications_kind_check\s+check \(kind in \(([^)]+)\)\)/g),
    ];
    const last = blocks.at(-1);
    expect(last).toBeDefined();
    const kinds = [...(last as RegExpMatchArray)[1].matchAll(/'([^']+)'/g)].map(
      (match) => match[1],
    );
    expect(kinds).toContain("night-match");
    expect(kinds).toContain("store-post");
  });

  it("the migration quotes the founder and stores nothing else", () => {
    const migration = read("supabase/migrations/20261028090000_nights.sql");
    expect(migration).toContain("What if, you just say you're going to an");
    expect(migration).not.toMatch(/create table/i);
    expect(migration).toMatch(/^begin;/m);
    expect(migration).toMatch(/^commit;/m);
  });

  it("notify.ts and the row type know the kind", () => {
    expect(read("src/lib/notifications/notify.ts")).toContain('| "night-match"');
    expect(read("src/lib/supabase/types.ts")).toContain('| "night-match"');
  });

  it("dedupes the goer once a day per night and the holder once per goer", () => {
    const notify = read("src/lib/notifications/notify.ts");
    expect(notify).toContain(
      "dedupeKey: `night:${entry.eventId}:${entry.playerId}:${entry.day}`",
    );
    expect(notify).toContain(
      "dedupeKey: `night:${entry.eventId}:${entry.holderId}:${entry.goerId}`",
    );
    /* The goer's notice has no actor; the holder's leads with the goer's face. */
    expect(notify).toMatch(
      /night:\$\{entry\.eventId\}:\$\{entry\.playerId\}:\$\{entry\.day\}`,\s+actorId: null/,
    );
    expect(notify).toMatch(
      /night:\$\{entry\.eventId\}:\$\{entry\.holderId\}:\$\{entry\.goerId\}`,\s+actorId: entry\.goerId/,
    );
  });

  it("says the exact words", () => {
    const notify = read("src/lib/notifications/notify.ts");
    expect(notify).toContain(
      '${n === 1 ? "person" : "people"} going to ${entry.eventName} ${n === 1 ? "is" : "are"} hunting cards in your binder',
    );
    expect(notify).toContain("Open the room to see who.");
    expect(notify).toContain(
      "${entry.goerName} is going to ${entry.eventName} and wants your ${entry.cardName}",
    );
    expect(notify).toContain("Tap to see the board.");
  });

  it("the matcher caps the roster, pushes, and never throws out of Going", () => {
    const matches = read("src/lib/events/night-matches.ts");
    expect(matches).toContain("NIGHT_MATCH_ROSTER_CAP = 20");
    expect(matches).toContain("catch (error)");
    expect(read("src/lib/events/going.ts")).toContain(
      "void afterGoing(eventId, playerId)",
    );
  });
});

describe("the API", () => {
  it("has the nights list and the Going routes", () => {
    expect(existsSync(join(process.cwd(), "src/app/api/v1/nights/route.ts"))).toBe(
      true,
    );
    const going = read("src/app/api/v1/nights/[eventId]/going/route.ts");
    expect(going).toContain("export async function POST");
    expect(going).toContain("export async function DELETE");
    expect(going).toContain('"not-found": 404');
    expect(going).toContain('"not-open": 409');
    expect(going).toContain('"no-account": 401');
  });

  it("the room answer carries phase and the Going state, and the roster when readable", () => {
    const route = read("src/app/api/v1/rooms/[code]/route.ts");
    expect(route).toContain("eventId: room.id,");
    expect(route).toContain("phase,");
    expect(route).toContain("goingCount: going.goingCount");
    expect(route).toContain("youGoing: going.youGoing");
    expect(route).toContain("roster: absoluteAvatars(roster)");
    /* The old build's boolean stays. */
    expect(route).toContain('early: phase === "early"');
  });

  it("the store's nights carry Going, and the route passes the viewer", () => {
    const profile = read("src/lib/stores/public-profile.ts");
    expect(profile).toContain("goingCount: number;");
    expect(profile).toContain("youGoing: boolean;");
    expect(profile).toContain("phase: NightPhase | null;");
    expect(read("src/app/api/v1/stores/[storeId]/route.ts")).toContain(
      "publicStore(storeId, account?.playerId ?? null)",
    );
  });
});

describe("the feed's upcoming card", () => {
  it("carries the next night's id and the Going state", () => {
    const feed = read("src/lib/feed/repository.ts");
    const shape = feed.slice(
      feed.indexOf("export interface UpcomingItem"),
      feed.indexOf("export interface RecentItem"),
    );
    expect(shape).toContain("nextEventId: string | null;");
    expect(shape).toContain("goingCount: number;");
    expect(shape).toContain("youGoing: boolean;");
    /* One batch read, not one per card. */
    expect(feed).toContain("goingStates([...idByCode.values()], playerId)");
  });
});

describe("the Nights list", () => {
  const night = (
    over: Partial<{
      phase: "live" | "early" | "upcoming" | "finished";
      startsAt: string;
      name: string;
    }>,
  ) => ({
    phase: "upcoming" as const,
    startsAt: "2026-10-10T01:00:00.000Z",
    name: "Locals",
    ...over,
  });

  it("puts live rooms first, then by start time", () => {
    const ordered = orderNights([
      night({ name: "Saturday", startsAt: "2026-10-11T01:00:00.000Z" }),
      night({ name: "Friday", startsAt: "2026-10-10T01:00:00.000Z" }),
      night({ name: "Tonight", phase: "live", startsAt: "2026-10-04T01:00:00.000Z" }),
      night({ name: "Early", phase: "early", startsAt: "2026-10-05T01:00:00.000Z" }),
    ]);
    expect(ordered.map((item) => item.name)).toEqual([
      "Tonight",
      "Early",
      "Friday",
      "Saturday",
    ]);
  });

  it("a live room that started later still leads a night that starts sooner", () => {
    const ordered = orderNights([
      night({ name: "Soon", startsAt: "2026-10-04T01:00:00.000Z" }),
      night({ name: "Walk-in", phase: "live", startsAt: "2026-10-09T01:00:00.000Z" }),
    ]);
    expect(ordered[0].name).toBe("Walk-in");
  });

  it("does not reorder the caller's array in place", () => {
    const items = [
      night({ name: "B", startsAt: "2026-10-11T01:00:00.000Z" }),
      night({ name: "A", startsAt: "2026-10-10T01:00:00.000Z" }),
    ];
    orderNights(items);
    expect(items[0].name).toBe("B");
  });

  it("puts finished nights last, newest first: the Past tab's order", () => {
    const ordered = orderNights([
      night({
        name: "Last week",
        phase: "finished",
        startsAt: "2026-09-26T01:00:00.000Z",
      }),
      night({ name: "Friday", startsAt: "2026-10-10T01:00:00.000Z" }),
      night({
        name: "Yesterday",
        phase: "finished",
        startsAt: "2026-10-02T01:00:00.000Z",
      }),
      night({ name: "Tonight", phase: "live", startsAt: "2026-10-04T01:00:00.000Z" }),
    ]);
    expect(ordered.map((item) => item.name)).toEqual([
      "Tonight",
      "Friday",
      "Yesterday",
      "Last week",
    ]);
  });

  it("reaches fourteen days ahead, thirty back for Past, and dedupes by event", () => {
    const nights = read("src/lib/events/nights.ts");
    expect(nights).toContain("HORIZON_MS = 14 * 24 * 60 * 60 * 1000");
    expect(nights).toContain("PAST_MS = 30 * 24 * 60 * 60 * 1000");
    expect(nights).toContain("new Map<string, NightRow>()");
    expect(nights).toContain("NEARBY_RADIUS_MILES");
    /* Only a seat the viewer held makes a closed night theirs. */
    expect(nights).toMatch(/\.in\("id", seated\)\s+\.eq\("status", "closed"\)/);
    expect(nights).toContain('if (phase === "pending") continue;');
  });

  it("carries here now and the dashboard's total where it means something", () => {
    const nights = read("src/lib/events/nights.ts");
    expect(nights).toContain(
      'export type NightPhase = "live" | "early" | "upcoming" | "finished";',
    );
    expect(nights).toContain("hereNow: number;");
    expect(nights).toContain("matches: number | null;");
    /* One batch for every night the viewer is going to, not one per card. */
    expect(nights).toContain("nightMatchSummaries(");
    expect(nights).toContain(
      '(night) => night.phase !== "finished" && states.get(night.eventId)?.youGoing',
    );
    expect(nights).toContain("matches: summary ? summary.total : null");
  });
});

describe("Going never reaches the client with the service role", () => {
  it("the server libs import server-only; the copy does not", () => {
    for (const path of [
      "src/lib/events/going.ts",
      "src/lib/events/nights.ts",
      "src/lib/events/night-matches.ts",
    ]) {
      expect(read(path), path).toContain('import "server-only"');
    }
    expect(read("src/lib/events/going-actions.ts")).toMatch(/^"use server";/);
  });
});
