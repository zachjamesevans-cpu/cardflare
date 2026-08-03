import { describe, expect, it } from "vitest";

import {
  boothSchema,
  groupAvailability,
  inventoryEntrySchema,
  showWindowIn,
  slabLabel,
} from "@/lib/shows/schema";

/**
 * The card-show rules. The stakes: a wrong slab label sends an attendee
 * across a hall for the wrong object, and a leak in availability grouping
 * would advertise a vendor's stock at a show they never said they were
 * attending.
 */

const CARD = "00000000-0000-0000-0000-0000000000c1";

function entry(overrides: Record<string, unknown> = {}) {
  return {
    cardId: CARD,
    printingId: "",
    form: "raw",
    grader: "",
    grade: "",
    quantity: "1",
    ...overrides,
  };
}

describe("inventoryEntrySchema", () => {
  it("accepts a raw single", () => {
    const result = inventoryEntrySchema.safeParse(entry());

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      form: "raw",
      grader: null,
      grade: null,
      printingId: null,
      quantity: 1,
    });
  });

  /*
   * The form hides grading fields for raw, but a stale hidden value must not
   * block the add — raw strips rather than rejects.
   */
  it("strips grading fields from a raw single", () => {
    const result = inventoryEntrySchema.safeParse(
      entry({ grader: "PSA", grade: "10" }),
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ grader: null, grade: null });
  });

  it("accepts a graded slab, normalising the grader's case", () => {
    const result = inventoryEntrySchema.safeParse(
      entry({ form: "slab", grader: "psa", grade: "9.5" }),
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ grader: "PSA", grade: 9.5 });
  });

  it("accepts a slab marked Authentic — a grader with no number", () => {
    const result = inventoryEntrySchema.safeParse(
      entry({ form: "slab", grader: "CGC" }),
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ grader: "CGC", grade: null });
  });

  it("refuses a slab that names no grader", () => {
    expect(inventoryEntrySchema.safeParse(entry({ form: "slab" })).success).toBe(false);
  });

  it.each([
    ["a quarter grade", "9.25"],
    ["over ten", "11"],
    ["under one", "0.5"],
  ])("refuses %s", (_label, grade) => {
    expect(
      inventoryEntrySchema.safeParse(entry({ form: "slab", grader: "BGS", grade }))
        .success,
    ).toBe(false);
  });

  it("refuses a grader that is not a short letter code", () => {
    for (const grader of ["P", "TOOLONGGG", "PSA9", "psa gems"]) {
      expect(
        inventoryEntrySchema.safeParse(entry({ form: "slab", grader })).success,
      ).toBe(false);
    }
  });
});

describe("slabLabel", () => {
  it("labels the three physical realities", () => {
    expect(slabLabel("raw", null, null)).toBe("Raw");
    expect(slabLabel("slab", "PSA", 10)).toBe("PSA 10");
    expect(slabLabel("slab", "BGS", 9.5)).toBe("BGS 9.5");
    expect(slabLabel("slab", "CGC", null)).toBe("CGC Authentic");
  });

  it("never prints a grade as 10.0", () => {
    expect(slabLabel("slab", "PSA", 10.0)).toBe("PSA 10");
  });
});

describe("boothSchema", () => {
  it("accepts booth numbers people actually have", () => {
    for (const booth of ["A12", "215", "Corner 3", "B-7"]) {
      expect(boothSchema.safeParse(booth).success).toBe(true);
    }
  });

  it("refuses the oversized and the empty", () => {
    for (const booth of ["", " ", "way too long for a booth", "-A12"]) {
      expect(boothSchema.safeParse(booth).success).toBe(false);
    }
  });
});

describe("showWindowIn", () => {
  it("converts a weekend in the venue's zone", () => {
    const window = showWindowIn(
      "2026-09-12T09:00",
      "2026-09-13T18:00",
      "America/Chicago",
    );

    expect(window.ok).toBe(true);
    if (window.ok) {
      // 9am CDT is 14:00 UTC — converted, not just labelled.
      expect(window.startsAt).toBe("2026-09-12T14:00:00.000Z");
    }
  });

  it("refuses a show that ends before it starts", () => {
    const window = showWindowIn(
      "2026-09-12T18:00",
      "2026-09-12T09:00",
      "America/Chicago",
    );

    expect(window).toMatchObject({ ok: false, field: "endsAt" });
  });

  it("refuses a show longer than a week — a typo, not a show", () => {
    const window = showWindowIn("2026-09-12T09:00", "2026-09-20T10:00", "UTC");

    expect(window).toMatchObject({ ok: false, field: "endsAt" });
  });
});

describe("groupAvailability", () => {
  const roster = new Map([
    ["vendor-a", { vendorName: "SlabCity", booth: "B7" }],
    ["vendor-b", { vendorName: "Raw Deals", booth: "A12" }],
  ]);

  function row(overrides: Record<string, unknown> = {}) {
    return {
      storeId: "vendor-a",
      cardId: CARD,
      form: "raw" as const,
      grader: null,
      grade: null,
      quantity: 1,
      printingLabel: null,
      ...overrides,
    };
  }

  it("groups by card, sorts vendors as a walking route", () => {
    const grouped = groupAvailability([row(), row({ storeId: "vendor-b" })], roster);

    expect(grouped.get(CARD)?.map((vendor) => vendor.booth)).toEqual(["A12", "B7"]);
  });

  it("sorts booths numerically, not lexically", () => {
    const grouped = groupAvailability(
      [row(), row({ storeId: "vendor-b" })],
      new Map([
        ["vendor-a", { vendorName: "A", booth: "2" }],
        ["vendor-b", { vendorName: "B", booth: "10" }],
      ]),
    );

    expect(grouped.get(CARD)?.map((vendor) => vendor.booth)).toEqual(["2", "10"]);
  });

  /*
   * The privacy rule: inventory from a vendor who never claimed a booth at
   * this show is not availability at this show. Without this, uploading
   * stock would advertise a vendor at every show in the system.
   */
  it("never shows inventory from a vendor not on this show's roster", () => {
    const grouped = groupAvailability([row({ storeId: "vendor-ghost" })], roster);

    expect(grouped.size).toBe(0);
  });

  it("puts slabs before raw, best grade first", () => {
    const grouped = groupAvailability(
      [
        row({ quantity: 4 }),
        row({ form: "slab" as const, grader: "PSA", grade: 9 }),
        row({ form: "slab" as const, grader: "PSA", grade: 10 }),
      ],
      roster,
    );

    const items = grouped.get(CARD)?.[0]?.items ?? [];
    expect(items.map((item) => item.grade ?? "raw")).toEqual([10, 9, "raw"]);
  });
});
