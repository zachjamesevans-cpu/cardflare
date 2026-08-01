import { describe, expect, it } from "vitest";

import { groupFailures, summariseSets } from "@/lib/cards/health";

describe("summariseSets", () => {
  /*
   * The number exists to be compared against an official set list. Counting
   * printings would overstate every set that has parallels, which is the one
   * way this figure could quietly mislead.
   */
  it("counts distinct cards, not printings", () => {
    const sets = summariseSets([
      { card_id: "a", set_code: "OP01" },
      { card_id: "a", set_code: "OP01" }, // alternate art of the same card
      { card_id: "b", set_code: "OP01" },
      { card_id: "c", set_code: "OP02" },
    ]);

    expect(sets).toEqual([
      { setCode: "OP01", cards: 2 },
      { setCode: "OP02", cards: 1 },
    ]);
  });

  it("orders by set code so a gap is visible at a glance", () => {
    const sets = summariseSets([
      { card_id: "c", set_code: "OP03" },
      { card_id: "a", set_code: "OP01" },
      { card_id: "b", set_code: "ST01" },
    ]);

    expect(sets.map((set) => set.setCode)).toEqual(["OP01", "OP03", "ST01"]);
  });

  /* A printing with no set code is still a card. Dropping it would make the
   * total disagree with the card pool count for no visible reason. */
  it("keeps printings with no set code rather than dropping them", () => {
    const sets = summariseSets([
      { card_id: "a", set_code: null },
      { card_id: "b", set_code: "OP01" },
    ]);

    expect(sets.find((set) => set.setCode === "(no set code)")?.cards).toBe(1);
  });

  it("returns nothing for an empty catalog", () => {
    expect(summariseSets([])).toEqual([]);
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
      { reason: "exactName: Required", count: 3 },
      { reason: "canonicalCardNumber: Too small", count: 2 },
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
