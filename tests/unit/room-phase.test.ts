import { describe, expect, it, vi, beforeEach } from "vitest";

import { earlyBoardOpensAt, roomPhase } from "@/lib/events/schema";
import { plusDaysInZone } from "@/lib/time/zone";

/**
 * The early board's two pure rules, pinned.
 *
 * `roomPhase` decides who may join what: an early board is a real door,
 * a pending draft is not, and the store's zero setting turns the whole
 * feature off. `plusDaysInZone` is how a recurring event rolls a week
 * forward — 6pm must still mean 6pm on the other side of a daylight-
 * saving change, which naive +7×24h arithmetic gets wrong twice a year.
 */

const HOUR = 60 * 60 * 1000;

function draftEvent(startsInMs: number, earlyBoardHours: number, now: number) {
  return {
    kind: "scheduled" as const,
    status: "draft" as const,
    startsAt: new Date(now + startsInMs).toISOString(),
    endsAt: new Date(now + startsInMs + 4 * HOUR).toISOString(),
    earlyBoardHours,
    // UTC in the generic cases so wall clock and instant agree; the
    // midnight rule gets its own zoned cases below.
    storeTimeZone: "UTC",
  };
}

describe("roomPhase", () => {
  const now = Date.parse("2026-08-12T18:00:00Z");

  it("an open room is live, whatever the clock says", () => {
    expect(
      roomPhase({ ...draftEvent(-2 * HOUR, 0, now), status: "open" as const }, now),
    ).toBe("live");
  });

  it("a closed room is finished", () => {
    expect(
      roomPhase({ ...draftEvent(-2 * HOUR, 48, now), status: "closed" as const }, now),
    ).toBe("finished");
  });

  it("a draft inside the early window is an open door", () => {
    expect(roomPhase(draftEvent(24 * HOUR, 48, now), now)).toBe("early");
  });

  it("a draft outside the window is pending", () => {
    expect(roomPhase(draftEvent(72 * HOUR, 48, now), now)).toBe("pending");
  });

  it("zero hours turns early boards off entirely", () => {
    expect(roomPhase(draftEvent(1 * HOUR, 0, now), now)).toBe("pending");
  });

  it("a draft whose window already ended is not early", () => {
    // Never opened, never swept: the event is over, not upcoming.
    expect(roomPhase(draftEvent(-30 * HOUR, 48, now), now)).toBe("pending");
  });

  it("a short window still opens at midnight of event day", () => {
    // 6pm event, 6-hour window (noon). At 9am the hours window has not
    // started, but it is already tournament day: the board is open.
    const nineAm = Date.parse("2026-08-14T09:00:00Z");
    const event = {
      kind: "scheduled" as const,
      status: "draft" as const,
      startsAt: "2026-08-14T18:00:00.000Z",
      endsAt: "2026-08-14T22:00:00.000Z",
      earlyBoardHours: 6,
      storeTimeZone: "UTC",
    };

    expect(roomPhase(event, nineAm)).toBe("early");
  });
});

describe("earlyBoardOpensAt", () => {
  it("opens at midnight of event day when the hours window is shorter", () => {
    // 6pm Chicago event with a 6-hour window (noon). Midnight wins.
    const opens = earlyBoardOpensAt({
      startsAt: "2026-08-14T23:00:00.000Z", // 6pm America/Chicago (UTC-5)
      earlyBoardHours: 6,
      storeTimeZone: "America/Chicago",
    });

    expect(opens).toBe(Date.parse("2026-08-14T05:00:00.000Z")); // 00:00 Chicago
  });

  it("keeps a window that reaches back further than midnight", () => {
    const startsAt = "2026-08-14T23:00:00.000Z";
    const opens = earlyBoardOpensAt({
      startsAt,
      earlyBoardHours: 48,
      storeTimeZone: "America/Chicago",
    });

    expect(opens).toBe(Date.parse(startsAt) - 48 * HOUR);
  });

  it("is off entirely at zero hours", () => {
    expect(
      earlyBoardOpensAt({
        startsAt: "2026-08-14T23:00:00.000Z",
        earlyBoardHours: 0,
        storeTimeZone: "America/Chicago",
      }),
    ).toBeNull();
  });

  it("computes midnight in the store's zone, not the server's", () => {
    // The same instant is Aug 14 in Tokyo and Aug 13 in Los Angeles, so
    // the two stores' midnights are 16 hours apart.
    const startsAt = "2026-08-14T03:00:00.000Z";

    const tokyo = earlyBoardOpensAt({
      startsAt,
      earlyBoardHours: 1,
      storeTimeZone: "Asia/Tokyo",
    });
    const la = earlyBoardOpensAt({
      startsAt,
      earlyBoardHours: 1,
      storeTimeZone: "America/Los_Angeles",
    });

    expect(tokyo).toBe(Date.parse("2026-08-13T15:00:00.000Z")); // 00:00 Aug 14 JST
    expect(la).toBe(Date.parse("2026-08-13T07:00:00.000Z")); // 00:00 Aug 13 PDT
  });
});

describe("plusDaysInZone", () => {
  it("keeps 6pm meaning 6pm across the fall-back change", () => {
    // 28 Oct 2026 is before the US change (1 Nov); +7 days lands after it.
    const before = new Date("2026-10-28T18:00:00-07:00");
    const after = plusDaysInZone(before, 7, "America/Los_Angeles");

    expect(after.toISOString()).toBe(
      new Date("2026-11-04T18:00:00-08:00").toISOString(),
    );
    // The instants are 169 hours apart — the extra hour is the point.
    expect(after.getTime() - before.getTime()).toBe(169 * HOUR);
  });

  it("keeps 6pm meaning 6pm across the spring-forward change", () => {
    const before = new Date("2026-03-04T18:00:00-08:00");
    const after = plusDaysInZone(before, 7, "America/Los_Angeles");

    expect(after.toISOString()).toBe(
      new Date("2026-03-11T18:00:00-07:00").toISOString(),
    );
    expect(after.getTime() - before.getTime()).toBe(167 * HOUR);
  });

  it("is a plain week where nothing changes", () => {
    const before = new Date("2026-08-12T18:00:00-07:00");
    const after = plusDaysInZone(before, 7, "America/Los_Angeles");

    expect(after.getTime() - before.getTime()).toBe(168 * HOUR);
  });
});

/**
 * The settle step: what every close path owes. Repository and lists are
 * mocked; the rule under test is the orchestration — expiry always runs,
 * successors only for recurring occurrences, dedupe wins races.
 */
const cancelNoShowFlares = vi.fn();
const findStoreById = vi.fn();
const scheduledEventExistsAt = vi.fn();
const createEvent = vi.fn();

vi.mock("@/lib/lists/repository", () => ({
  cancelNoShowFlares: (...a: unknown[]) => cancelNoShowFlares(...a),
}));
vi.mock("@/lib/events/repository", () => ({
  closeEndedScheduledEvents: vi.fn(),
  closeWalkInRoom: vi.fn(),
  createEvent: (...a: unknown[]) => createEvent(...a),
  findEventByJoinCode: vi.fn(),
  findEarlyBoard: vi.fn(),
  findOpenWalkInRoom: vi.fn(),
  findRunningScheduledEvent: vi.fn(),
  findShowByJoinCode: vi.fn(),
  findStoreByJoinCode: vi.fn(),
  findStoreById: (...a: unknown[]) => findStoreById(...a),
  latestActivityAt: vi.fn(),
  listOpenRoomsAcrossStores: vi.fn(),
  openWalkInRoom: vi.fn(),
  scheduledEventExistsAt: (...a: unknown[]) => scheduledEventExistsAt(...a),
}));

const { settleClosedOccurrences } = await import("@/lib/events/rooms");

const OCCURRENCE = {
  id: "event-1",
  storeId: "store-1",
  name: "Wednesday Locals",
  startsAt: "2026-10-28T18:00:00.000Z",
  endsAt: "2026-10-28T22:00:00.000Z",
  repeatWeekly: true,
};

describe("settleClosedOccurrences", () => {
  beforeEach(() => {
    for (const fn of [
      cancelNoShowFlares,
      findStoreById,
      scheduledEventExistsAt,
      createEvent,
    ]) {
      fn.mockReset();
    }
    findStoreById.mockResolvedValue({ id: "store-1", timezone: "UTC" });
    scheduledEventExistsAt.mockResolvedValue(false);
    createEvent.mockResolvedValue({ id: "event-2" });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("expires no-shows and rolls a recurring occurrence one week", async () => {
    await settleClosedOccurrences([OCCURRENCE]);

    expect(cancelNoShowFlares).toHaveBeenCalledWith("event-1", OCCURRENCE.startsAt);
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "store-1",
        name: "Wednesday Locals",
        startsAt: new Date("2026-11-04T18:00:00.000Z"),
        endsAt: new Date("2026-11-04T22:00:00.000Z"),
        repeatWeekly: true,
      }),
      null,
    );
  });

  it("expires no-shows but never rolls a one-off", async () => {
    await settleClosedOccurrences([{ ...OCCURRENCE, repeatWeekly: false }]);

    expect(cancelNoShowFlares).toHaveBeenCalled();
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("does not create a second Wednesday when one already exists", async () => {
    scheduledEventExistsAt.mockResolvedValue(true);

    await settleClosedOccurrences([OCCURRENCE]);

    expect(createEvent).not.toHaveBeenCalled();
  });

  it("a failed roll never throws out of the settle", async () => {
    createEvent.mockRejectedValue(new Error("boom"));

    await expect(settleClosedOccurrences([OCCURRENCE])).resolves.toBeUndefined();
  });
});
