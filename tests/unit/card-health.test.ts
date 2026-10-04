import { describe, expect, it } from "vitest";

import {
  coverageFromRows,
  groupFailures,
  NO_SET_CODE,
  previewRecord,
} from "@/lib/cards/health";

describe("coverageFromRows", () => {
  /*
   * The counting is the database's (`catalog_sets` counts distinct cards,
   * not printings, per game and set code). This shapes its rows: names
   * the codeless bucket, reads the count as a number, and orders by game
   * then code so a gap is visible at a glance.
   */
  it("keeps the game and the set's name beside the code", () => {
    const sets = coverageFromRows([
      { game: "one-piece", set_code: "OP01", set_name: "Romance Dawn", cards: 2 },
      { game: "mtg", set_code: "MKM", set_name: "Murders at Karlov Manor", cards: 1 },
    ]);

    expect(sets).toEqual([
      { game: "mtg", setCode: "MKM", setName: "Murders at Karlov Manor", cards: 1 },
      { game: "one-piece", setCode: "OP01", setName: "Romance Dawn", cards: 2 },
    ]);
  });

  it("orders by game, then set code, so a gap is visible at a glance", () => {
    const sets = coverageFromRows([
      { game: "one-piece", set_code: "OP03", set_name: null, cards: 1 },
      { game: "one-piece", set_code: "OP01", set_name: null, cards: 1 },
      { game: "one-piece", set_code: "ST01", set_name: null, cards: 1 },
    ]);

    expect(sets.map((set) => set.setCode)).toEqual(["OP01", "OP03", "ST01"]);
  });

  /* A printing with no set code is still a card. Dropping it would make the
   * total disagree with the card pool count for no visible reason. */
  it("keeps printings with no set code rather than dropping them", () => {
    const sets = coverageFromRows([
      { game: "one-piece", set_code: null, set_name: null, cards: 1 },
      { game: "one-piece", set_code: "OP01", set_name: null, cards: 3 },
    ]);

    expect(sets.find((set) => set.setCode === NO_SET_CODE)?.cards).toBe(1);
  });

  it("reads a count the driver hands back as a string", () => {
    const sets = coverageFromRows([
      { game: "one-piece", set_code: "OP01", set_name: null, cards: "4" as never },
    ]);
    expect(sets[0]?.cards).toBe(4);
  });

  it("returns nothing for an empty catalog", () => {
    expect(coverageFromRows([])).toEqual([]);
  });
});

describe("groupFailures", () => {
  it("collapses identical reasons and leads with the commonest", () => {
    const groups = groupFailures([
      "exactName: Required",
      "canonicalCardNumber: Too small",
      "exactName: Required",
      "exactName: Required",
      "canonicalCardNumber: Too small",
    ]);

    expect(groups).toEqual([
      { reason: "exactName: Required", count: 3, example: null },
      { reason: "canonicalCardNumber: Too small", count: 2, example: null },
    ]);
  });

  /*
   * A provider renaming one field produces thousands of identical strings. The
   * cap keeps the panel readable; the ordering keeps the rarer second problem
   * from being the one that gets cut.
   */
  it("caps the list, keeping the biggest groups", () => {
    const reasons = Array.from({ length: 20 }, (_, i) =>
      Array.from({ length: i + 1 }, () => `reason ${i}`),
    ).flat();

    const groups = groupFailures(reasons, 3);

    expect(groups.map((group) => group.count)).toEqual([20, 19, 18]);
  });

  it("breaks ties predictably, so the panel does not reshuffle between loads", () => {
    expect(groupFailures(["b", "a"]).map((group) => group.reason)).toEqual(["a", "b"]);
  });

  it("returns nothing for a clean run", () => {
    expect(groupFailures([])).toEqual([]);
  });
});

describe("previewRecord", () => {
  it("pretty-prints so field names are readable", () => {
    const text = previewRecord({ card_set_id: null, card_name: "DON!!" });

    expect(text).toContain('"card_set_id": null');
    expect(text).toContain('"card_name": "DON!!"');
  });

  it("bounds the output and says it did", () => {
    const text = previewRecord({ note: "x".repeat(500) }, 100);

    expect(text!.length).toBeLessThan(150);
    expect(text).toContain("truncated");
  });

  it("has nothing to show for a record that was never stored", () => {
    expect(previewRecord(null)).toBeNull();
    expect(previewRecord(undefined)).toBeNull();
  });

  /* A summary panel must never be the thing that takes /admin down. */
  it("returns null rather than throwing on a value it cannot serialise", () => {
    const hostile = {
      get boom() {
        throw new Error("nope");
      },
    };

    expect(previewRecord(hostile)).toBeNull();
  });
});
