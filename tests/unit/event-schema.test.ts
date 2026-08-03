import { describe, expect, it } from "vitest";

import { createEventSchema, EVENT_NAME_MAX } from "@/lib/events/schema";
import {
  defaultEventWindow,
  eventWindowIn,
  formatEventWindow,
} from "@/lib/events/format";

const STORE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function input(overrides: Record<string, unknown> = {}) {
  return {
    storeId: STORE_ID,
    name: "Friday Night One Piece",
    startsAt: "2026-08-14T18:00",
    endsAt: "2026-08-14T22:00",
    ...overrides,
  };
}

describe("createEventSchema", () => {
  it("accepts a well-formed event", () => {
    expect(createEventSchema.safeParse(input()).success).toBe(true);
  });

  it("rejects a store id that is not a uuid", () => {
    expect(createEventSchema.safeParse(input({ storeId: "not-a-uuid" })).success).toBe(
      false,
    );
  });

  it("collapses whitespace in the name", () => {
    const result = createEventSchema.safeParse(input({ name: "  Friday   Night  " }));

    expect(result.data?.name).toBe("Friday Night");
  });

  it("rejects an empty or whitespace-only name", () => {
    for (const name of ["", "   "]) {
      expect(createEventSchema.safeParse(input({ name })).success).toBe(false);
    }
  });

  it("bounds the name length", () => {
    expect(
      createEventSchema.safeParse(input({ name: "x".repeat(EVENT_NAME_MAX) })).success,
    ).toBe(true);
    expect(
      createEventSchema.safeParse(input({ name: "x".repeat(EVENT_NAME_MAX + 1) }))
        .success,
    ).toBe(false);
  });

  /*
   * Ordering and duration are checked by `eventWindowIn`, not here.
   *
   * They need the store's timezone, which is deliberately absent from the
   * form. They also have to compare real instants: across a daylight-saving
   * change a window that reads as four hours on the wall clock is three or
   * five, so comparing the typed strings would check the wrong thing.
   */
  it("leaves the ordering of two well-formed times to eventWindowIn", () => {
    const result = createEventSchema.safeParse(
      input({ startsAt: "2026-08-14T18:00", endsAt: "2026-08-14T17:00" }),
    );

    expect(result.success).toBe(true);
  });

  it("rejects an unparseable date", () => {
    expect(createEventSchema.safeParse(input({ startsAt: "not-a-date" })).success).toBe(
      false,
    );
  });
});

describe("defaultEventWindow", () => {
  it("starts on the next whole hour and runs four hours", () => {
    const window = defaultEventWindow("UTC", new Date("2026-08-14T18:37:12Z"));

    expect(window.startsAt).toBe("2026-08-14T19:00");
    expect(window.endsAt).toBe("2026-08-14T23:00");
  });

  it("rolls over midnight correctly", () => {
    const window = defaultEventWindow("UTC", new Date("2026-08-14T23:10:00Z"));

    expect(window.startsAt).toBe("2026-08-15T00:00");
    expect(window.endsAt).toBe("2026-08-15T04:00");
  });

  /*
   * Rounded on the store's clock, not on UTC. A store owner opening the form
   * should see the next hour where they are standing.
   */
  it("rounds on the store's own clock", () => {
    const window = defaultEventWindow(
      "America/Chicago",
      new Date("2026-08-14T18:37:12Z"),
    );

    // 18:37Z is 13:37 in Chicago, so the next whole hour is 14:00 local.
    expect(window.startsAt).toBe("2026-08-14T14:00");
    expect(window.endsAt).toBe("2026-08-14T18:00");
  });

  /* A half-hour zone would otherwise prefill 6:30 when the store meant 7:00. */
  it("lands on a whole hour even in a half-hour zone", () => {
    const window = defaultEventWindow("Asia/Kolkata", new Date("2026-08-14T18:37:12Z"));

    expect(window.startsAt).toMatch(/T\d{2}:00$/);
    expect(window.endsAt).toMatch(/T\d{2}:00$/);
  });

  it("produces values the schema accepts", () => {
    for (const zone of ["UTC", "America/Chicago", "Asia/Kolkata"]) {
      const window = defaultEventWindow(zone, new Date("2026-08-14T18:37:12Z"));

      expect(createEventSchema.safeParse(input(window)).success).toBe(true);
    }
  });
});

describe("formatEventWindow", () => {
  it("shows the date once when the event does not cross midnight", () => {
    const label = formatEventWindow(
      "2026-08-14T18:00:00Z",
      "2026-08-14T22:00:00Z",
      "UTC",
    );

    expect(label).toContain("Aug 14");
    expect(label.match(/Aug 14/g)).toHaveLength(1);
    expect(label).toContain("UTC");
  });

  it("shows both dates when the event crosses midnight", () => {
    const label = formatEventWindow(
      "2026-08-14T22:00:00Z",
      "2026-08-15T02:00:00Z",
      "UTC",
    );

    expect(label).toContain("Aug 14");
    expect(label).toContain("Aug 15");
  });

  /*
   * The whole point. The same instant reads as evening in Chicago and as the
   * small hours of the next morning in UTC, and a store must see its own.
   */
  it("renders an instant in the store's zone, not the server's", () => {
    const instant = "2026-08-14T23:00:00Z";
    const label = formatEventWindow(instant, "2026-08-15T03:00:00Z", "America/Chicago");

    expect(label).toContain("6:00 PM");
    expect(label).toContain("CDT");
    expect(label).not.toContain("UTC");
  });

  /* Midnight is decided on the store's clock, not on the server's. */
  it("counts crossing midnight in the store's zone", () => {
    // 23:00Z to 03:00Z crosses midnight in UTC but is 6pm to 10pm in Chicago.
    const label = formatEventWindow(
      "2026-08-14T23:00:00Z",
      "2026-08-15T03:00:00Z",
      "America/Chicago",
    );

    expect(label.match(/Aug 14/g)).toHaveLength(1);
    expect(label).not.toContain("Aug 15");
  });

  it("labels a walk-in room with the store's zone too", () => {
    const label = formatEventWindow("2026-08-14T23:00:00Z", null, "America/Chicago");

    expect(label).toContain("Open since");
    expect(label).toContain("CDT");
  });
});

/**
 * Turning two typed times into a window, in the store's zone.
 *
 * This is where the checks that used to live in the schema went, and where the
 * conversion happens — so it is the seam that decides whether a store's 6pm is
 * stored as 6pm.
 */
describe("eventWindowIn", () => {
  const CHICAGO = "America/Chicago";

  it("converts both ends from the store's clock", () => {
    const window = eventWindowIn("2026-09-12T18:00", "2026-09-12T22:00", CHICAGO);

    expect(window.ok).toBe(true);
    if (!window.ok) return;

    expect(window.startsAt.toISOString()).toBe("2026-09-12T23:00:00.000Z");
    expect(window.endsAt.toISOString()).toBe("2026-09-13T03:00:00.000Z");
  });

  it("rejects an end at or before the start", () => {
    for (const endsAt of ["2026-09-12T18:00", "2026-09-12T17:00"]) {
      const window = eventWindowIn("2026-09-12T18:00", endsAt, CHICAGO);

      expect(window.ok).toBe(false);
      if (!window.ok) expect(window.problem.field).toBe("endsAt");
    }
  });

  it("rejects an event longer than a day, which is always a typo", () => {
    const window = eventWindowIn("2026-09-12T18:00", "2026-09-14T18:00", CHICAGO);

    expect(window.ok).toBe(false);
    if (!window.ok) expect(window.problem.field).toBe("endsAt");
  });

  it("accepts an event of exactly 24 hours", () => {
    const window = eventWindowIn("2026-09-12T18:00", "2026-09-13T18:00", CHICAGO);

    expect(window.ok).toBe(true);
  });

  /*
   * The reason the duration is measured on instants. Twenty-five wall-clock
   * hours across the autumn change is twenty-six real ones and must be
   * refused; twenty-four across the spring change is only twenty-three and
   * must be allowed.
   */
  it("measures duration in real hours across a daylight-saving change", () => {
    const overAutumn = eventWindowIn("2026-10-31T18:00", "2026-11-01T19:00", CHICAGO);
    const overSpring = eventWindowIn("2026-03-07T18:00", "2026-03-08T18:00", CHICAGO);

    expect(overAutumn.ok).toBe(false);
    expect(overSpring.ok).toBe(true);
  });

  it("refuses a malformed time on the field it came from", () => {
    const bad = eventWindowIn("nonsense", "2026-09-12T22:00", CHICAGO);

    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.problem.field).toBe("startsAt");
  });

  /* The zone reaches this from the store row, but a bad one must not throw. */
  it("refuses a zone it does not know", () => {
    const window = eventWindowIn(
      "2026-09-12T18:00",
      "2026-09-12T22:00",
      "Mars/Olympus",
    );

    expect(window.ok).toBe(false);
  });
});
