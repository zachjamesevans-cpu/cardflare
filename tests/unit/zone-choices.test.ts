import { describe, expect, it } from "vitest";

import { timeZoneChoices } from "@/lib/time/zone-choices";
import { isValidTimeZone } from "@/lib/time/zone";

/**
 * The short timezone menu. Two things must never break: every value is a
 * real IANA name (a friendly label over a typo would store a zone that
 * fails validation), and a store's current zone survives the menu getting
 * shorter — opening the form must never silently move a store.
 */

const flatten = (groups: ReturnType<typeof timeZoneChoices>) =>
  groups.flatMap((group) => group.choices.map((choice) => choice.value));

describe("timeZoneChoices", () => {
  it("offers only zones this runtime actually knows", () => {
    for (const value of flatten(timeZoneChoices())) {
      expect(isValidTimeZone(value), `${value} is not a known zone`).toBe(true);
    }
  });

  it("offers each zone exactly once", () => {
    const values = flatten(timeZoneChoices());

    expect(new Set(values).size).toBe(values.length);
  });

  it("keeps a store's off-menu zone selectable, once", () => {
    const groups = timeZoneChoices("America/Boise");
    const values = flatten(groups);

    expect(values.filter((value) => value === "America/Boise")).toHaveLength(1);
    expect(groups.at(-1)?.label).toBe("Currently set");
  });

  it("adds nothing extra for a zone already on the menu, or for UTC", () => {
    for (const current of ["America/Chicago", "UTC"]) {
      const groups = timeZoneChoices(current);

      expect(groups.every((group) => group.label !== "Currently set")).toBe(true);
    }
  });
});
