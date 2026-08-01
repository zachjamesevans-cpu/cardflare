import { describe, expect, it } from "vitest";

import { createEventSchema, EVENT_NAME_MAX } from "@/lib/events/schema";
import { defaultEventWindow, formatEventWindow } from "@/lib/events/format";

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
   * The database enforces this too. Catching it here means the store gets a
   * message on the field rather than a generic failure.
   */
  it("rejects an end time at or before the start", () => {
    for (const endsAt of ["2026-08-14T18:00", "2026-08-14T17:00"]) {
      const result = createEventSchema.safeParse(input({ endsAt }));

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(["endsAt"]);
    }
  });

  it("rejects an event longer than a day, which is always a typo", () => {
    const result = createEventSchema.safeParse(
      input({ startsAt: "2026-08-14T18:00", endsAt: "2026-08-16T18:00" }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["endsAt"]);
  });

  it("accepts an event of exactly 24 hours", () => {
    const result = createEventSchema.safeParse(
      input({ startsAt: "2026-08-14T18:00", endsAt: "2026-08-15T18:00" }),
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
    const window = defaultEventWindow(new Date("2026-08-14T18:37:12Z"));

    expect(window.startsAt).toBe("2026-08-14T19:00");
    expect(window.endsAt).toBe("2026-08-14T23:00");
  });

  it("rolls over midnight correctly", () => {
    const window = defaultEventWindow(new Date("2026-08-14T23:10:00Z"));

    expect(window.startsAt).toBe("2026-08-15T00:00");
    expect(window.endsAt).toBe("2026-08-15T04:00");
  });

  it("produces values the schema accepts", () => {
    const window = defaultEventWindow(new Date("2026-08-14T18:37:12Z"));

    expect(createEventSchema.safeParse(input(window)).success).toBe(true);
  });
});

describe("formatEventWindow", () => {
  it("shows the date once when the event does not cross midnight", () => {
    const label = formatEventWindow("2026-08-14T18:00:00Z", "2026-08-14T22:00:00Z");

    expect(label).toContain("Aug 14");
    expect(label.match(/Aug 14/g)).toHaveLength(1);
    expect(label).toContain("UTC");
  });

  it("shows both dates when the event crosses midnight", () => {
    const label = formatEventWindow("2026-08-14T22:00:00Z", "2026-08-15T02:00:00Z");

    expect(label).toContain("Aug 14");
    expect(label).toContain("Aug 15");
  });
});
