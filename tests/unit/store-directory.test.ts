import { describe, expect, it } from "vitest";

import { filterOperators, matchesOperator } from "@/lib/stores/directory";

/**
 * The operator directory's filter. The stakes are small but real: an admin
 * at a pilot night types a store's name to print its poster, and a filter
 * that misses on case or on a city would read as "the store is gone".
 */

function operator(over: Record<string, unknown> = {}) {
  return {
    name: "Grand Line Games",
    contact_email: "owner@grandline.example",
    city: "Austin",
    region: "TX",
    kind: "lgs",
    ...over,
  };
}

describe("matchesOperator", () => {
  it("matches name, email, city and region, case-insensitively", () => {
    const store = operator();

    for (const query of ["grand", "LINE", "owner@", "austin", "tx"]) {
      expect(matchesOperator(store, query)).toBe(true);
    }
  });

  it("ignores surrounding whitespace and matches everyone on blank", () => {
    expect(matchesOperator(operator(), "  grand  ")).toBe(true);
    expect(matchesOperator(operator(), "")).toBe(true);
    expect(matchesOperator(operator(), "   ")).toBe(true);
  });

  it("does not match what is not there", () => {
    expect(matchesOperator(operator(), "slabcity")).toBe(false);
  });

  it("survives null city and region", () => {
    expect(matchesOperator(operator({ city: null, region: null }), "grand")).toBe(true);
    expect(matchesOperator(operator({ city: null, region: null }), "austin")).toBe(
      false,
    );
  });
});

describe("filterOperators", () => {
  const stores = [
    operator({ name: "Reverse Mountain Cards" }),
    operator({ name: "SlabCity Singles", kind: "vendor", city: "Dallas" }),
    operator({ name: "Grand Line Games" }),
  ];

  it("filters by kind through the dropdown", () => {
    expect(filterOperators(stores, "", "vendor").map((s) => s.name)).toEqual([
      "SlabCity Singles",
    ]);
    expect(filterOperators(stores, "", "lgs")).toHaveLength(2);
  });

  it("combines kind and search", () => {
    expect(filterOperators(stores, "dallas", "lgs")).toHaveLength(0);
    expect(filterOperators(stores, "dallas", "vendor")).toHaveLength(1);
  });

  it("sorts alphabetically — a directory, not a timeline", () => {
    expect(filterOperators(stores, "", "all").map((s) => s.name)).toEqual([
      "Grand Line Games",
      "Reverse Mountain Cards",
      "SlabCity Singles",
    ]);
  });

  it("leaves the input array untouched", () => {
    const before = [...stores];
    filterOperators(stores, "", "all");
    expect(stores).toEqual(before);
  });
});
