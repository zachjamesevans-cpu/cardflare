import { describe, expect, it } from "vitest";

import {
  instantToLocal,
  isValidTimeZone,
  knownTimeZones,
  localToInstant,
  zoneAbbreviation,
} from "@/lib/time/zone";

/**
 * Wall-clock time in a place, turned into an instant.
 *
 * The bug being fixed was not cosmetic. `datetime-local` submits a bare
 * "2026-09-12T18:00", and `Date.parse` reads that in the server's zone — UTC
 * on Vercel — so a store owner in Austin typing 6pm stored one in the
 * afternoon. Every assertion about a stored instant below is really about
 * that.
 *
 * Daylight saving is where this kind of code is wrong, so most of what follows
 * is about the days it changes: the hour that does not exist in spring, the
 * hour that happens twice in autumn, and the two dates either side.
 */

const CHICAGO = "America/Chicago"; // CST −06:00, CDT −05:00
const LONDON = "Europe/London"; // GMT +00:00, BST +01:00
const TOKYO = "Asia/Tokyo"; // +09:00 all year, no DST
const KOLKATA = "Asia/Kolkata"; // +05:30, a half-hour offset

const iso = (date: Date | null) => date?.toISOString() ?? null;

describe("localToInstant", () => {
  it("reads a typed time as local to the zone, not as UTC", () => {
    // 6pm in Chicago in September is CDT, which is UTC−5.
    expect(iso(localToInstant("2026-09-12T18:00", CHICAGO))).toBe(
      "2026-09-12T23:00:00.000Z",
    );
  });

  /* The regression, stated directly. */
  it("does not store the typed numbers as if they were UTC", () => {
    expect(iso(localToInstant("2026-09-12T18:00", CHICAGO))).not.toBe(
      "2026-09-12T18:00:00.000Z",
    );
  });

  it("is the identity in UTC", () => {
    expect(iso(localToInstant("2026-09-12T18:00", "UTC"))).toBe(
      "2026-09-12T18:00:00.000Z",
    );
  });

  it("handles a zone ahead of UTC", () => {
    expect(iso(localToInstant("2026-09-12T18:00", TOKYO))).toBe(
      "2026-09-12T09:00:00.000Z",
    );
  });

  /* Not every offset is a whole hour, and the arithmetic must not assume it. */
  it("handles a half-hour offset", () => {
    expect(iso(localToInstant("2026-09-12T18:00", KOLKATA))).toBe(
      "2026-09-12T12:30:00.000Z",
    );
  });

  describe("across a daylight-saving change", () => {
    /*
     * These two are the reason the correction pass exists, and the only cases
     * that can prove it does.
     *
     * The passes only disagree when a transition falls between the typed time
     * read as UTC and the candidate instant — a window of a few hours after
     * the changeover, in local terms. An event at 6pm on the changeover day is
     * outside it and comes out right either way; 6am is inside it, and a
     * single-pass conversion is an hour wrong.
     *
     * A store opening early on the Sunday the clocks change is a real thing,
     * and the sheet on the counter would have said the wrong time.
     */
    it("is right in the hours just after the clocks go forward", () => {
      // 8 March 2026, Chicago springs forward at 02:00. 06:00 local is CDT.
      expect(iso(localToInstant("2026-03-08T06:00", CHICAGO))).toBe(
        "2026-03-08T11:00:00.000Z",
      );
    });

    it("is right in the hours just after the clocks go back", () => {
      // 1 November 2026, Chicago falls back at 02:00. 06:00 local is CST.
      expect(iso(localToInstant("2026-11-01T06:00", CHICAGO))).toBe(
        "2026-11-01T12:00:00.000Z",
      );
    });

    it("uses winter time before the spring change", () => {
      // 8 March 2026, Chicago springs forward at 02:00 local. The day before
      // is still CST, UTC−6.
      expect(iso(localToInstant("2026-03-07T18:00", CHICAGO))).toBe(
        "2026-03-08T00:00:00.000Z",
      );
    });

    it("uses summer time after the spring change", () => {
      expect(iso(localToInstant("2026-03-08T18:00", CHICAGO))).toBe(
        "2026-03-08T23:00:00.000Z",
      );
    });

    it("uses summer time before the autumn change", () => {
      // 1 November 2026, Chicago falls back at 02:00 local.
      expect(iso(localToInstant("2026-10-31T18:00", CHICAGO))).toBe(
        "2026-10-31T23:00:00.000Z",
      );
    });

    it("uses winter time after the autumn change", () => {
      expect(iso(localToInstant("2026-11-01T18:00", CHICAGO))).toBe(
        "2026-11-02T00:00:00.000Z",
      );
    });

    it("gets the same right in the southern half of the year in London", () => {
      // British Summer Time, UTC+1, so 18:00 local is 17:00Z.
      expect(iso(localToInstant("2026-07-01T18:00", LONDON))).toBe(
        "2026-07-01T17:00:00.000Z",
      );
      // And GMT in January.
      expect(iso(localToInstant("2026-01-01T18:00", LONDON))).toBe(
        "2026-01-01T18:00:00.000Z",
      );
    });

    /*
     * 02:30 on the morning the clocks go forward never happens in Chicago.
     * A store cannot schedule an event then, but the form can submit it, so
     * the result has to be a real instant rather than a crash or a NaN.
     */
    it("resolves a wall-clock time that does not exist", () => {
      const result = localToInstant("2026-03-08T02:30", CHICAGO);

      expect(result).not.toBeNull();
      expect(Number.isNaN(result!.getTime())).toBe(false);
    });

    /*
     * 01:30 on the morning the clocks go back happens twice. Either answer is
     * defensible; what matters is that it is one of them and not something an
     * hour outside the pair.
     */
    it("resolves a wall-clock time that happens twice", () => {
      const result = iso(localToInstant("2026-11-01T01:30", CHICAGO));

      expect(["2026-11-01T06:30:00.000Z", "2026-11-01T07:30:00.000Z"]).toContain(
        result,
      );
    });
  });

  describe("rejecting what a form can send", () => {
    it("refuses a malformed local time", () => {
      for (const value of [
        "",
        "2026-09-12",
        "18:00",
        "2026-09-12 18:00",
        "2026-09-12T18:00:00",
        "not a date",
      ]) {
        expect(localToInstant(value, CHICAGO)).toBeNull();
      }
    });

    /* The zone comes from a form too, so it is not to be trusted either. */
    it("refuses a zone this runtime does not know", () => {
      for (const zone of ["", "Mars/Olympus", "GMT+5", "America/Nowhere"]) {
        expect(localToInstant("2026-09-12T18:00", zone)).toBeNull();
      }
    });
  });
});

describe("instantToLocal", () => {
  it("is the inverse of localToInstant", () => {
    for (const zone of [CHICAGO, LONDON, TOKYO, KOLKATA, "UTC"]) {
      for (const local of [
        "2026-01-15T09:30",
        "2026-07-04T20:00",
        "2026-03-07T18:00",
        "2026-11-02T06:45",
      ]) {
        const instant = localToInstant(local, zone);

        expect(instantToLocal(instant!, zone)).toBe(local);
      }
    }
  });

  it("shows an instant as the wall clock in that zone", () => {
    const instant = new Date("2026-09-12T23:00:00.000Z");

    expect(instantToLocal(instant, CHICAGO)).toBe("2026-09-12T18:00");
    expect(instantToLocal(instant, TOKYO)).toBe("2026-09-13T08:00");
  });
});

describe("isValidTimeZone", () => {
  it("accepts real IANA names", () => {
    for (const zone of [CHICAGO, LONDON, TOKYO, "UTC", "Australia/Sydney"]) {
      expect(isValidTimeZone(zone)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    for (const zone of ["", "   ", "Mars/Olympus", "America/Nowhere"]) {
      expect(isValidTimeZone(zone)).toBe(false);
    }
  });
});

describe("knownTimeZones", () => {
  it("offers a real list to pick from", () => {
    const zones = knownTimeZones();

    expect(zones.length).toBeGreaterThan(100);
    expect(zones).toContain(CHICAGO);
  });

  it("only offers zones that validate", () => {
    for (const zone of knownTimeZones()) {
      expect(isValidTimeZone(zone)).toBe(true);
    }
  });

  /*
   * The bug this exists for. `Intl.supportedValuesOf` does not list "UTC", and
   * UTC is the column default — so an unset store's <select> had nothing
   * matching its own value and the browser preselected the first entry,
   * Africa/Abidjan. Saving would have set a zone nobody chose, and because it
   * shares UTC's offset the times would have looked right while the label lied.
   */
  it("includes UTC, which Intl does not list", () => {
    expect(Intl.supportedValuesOf("timeZone")).not.toContain("UTC");
    expect(knownTimeZones()).toContain("UTC");
  });

  it("always contains the zone currently in use", () => {
    for (const current of ["UTC", CHICAGO, TOKYO]) {
      expect(knownTimeZones(current)).toContain(current);
    }
  });

  /* A zone dropped from a future IANA release must stay selectable. */
  it("keeps a current zone the runtime no longer lists", () => {
    const zones = knownTimeZones("America/Godthab");

    expect(zones).toContain("America/Godthab");
  });

  it("never repeats an entry, which would render duplicate options", () => {
    for (const current of [undefined, "UTC", CHICAGO]) {
      const zones = knownTimeZones(current);

      expect(new Set(zones).size).toBe(zones.length);
    }
  });
});

describe("zoneAbbreviation", () => {
  /* "CDT" is what a store owner would say; "America/Chicago" is not. */
  it("names the zone the way a person would", () => {
    expect(zoneAbbreviation(new Date("2026-09-12T23:00:00.000Z"), CHICAGO)).toBe("CDT");
    expect(zoneAbbreviation(new Date("2026-01-12T23:00:00.000Z"), CHICAGO)).toBe("CST");
  });

  it("follows the season rather than the name", () => {
    const summer = zoneAbbreviation(new Date("2026-07-01T12:00:00.000Z"), LONDON);
    const winter = zoneAbbreviation(new Date("2026-01-01T12:00:00.000Z"), LONDON);

    expect(summer).not.toBe(winter);
  });
});
