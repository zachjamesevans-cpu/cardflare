import { describe, expect, it } from "vitest";

import { exactNumberOnly } from "@/lib/cards/search";

/**
 * A search that is a card number answers with that card only, every game
 * (the founder, 2026-11-25: "should really only show the exact card when
 * I search for it for all tcg's").
 */
const rows = (...numbers: string[]) =>
  numbers.map((canonical_card_number) => ({ canonical_card_number }));
const numbers = (list: { canonical_card_number: string }[]) =>
  list.map((row) => row.canonical_card_number);

describe("an exact card number", () => {
  it("keeps only the card with that number, however it is typed", () => {
    const found = rows("OP12-034", "OP10-034", "OP11-034", "OP12-030");
    expect(numbers(exactNumberOnly("OP12-034", found))).toEqual(["OP12-034"]);
    expect(numbers(exactNumberOnly("op12-034", found))).toEqual(["OP12-034"]);
    expect(numbers(exactNumberOnly("op12034", found))).toEqual(["OP12-034"]);
    expect(numbers(exactNumberOnly(" OP12 034 ", found))).toEqual(["OP12-034"]);
  });

  it("works for every game's numbering", () => {
    expect(
      numbers(exactNumberOnly("sv1-1", rows("SV1-1", "SV1-10", "SV1-100"))),
    ).toEqual(["SV1-1"]);
    expect(numbers(exactNumberOnly("BLB-1", rows("BLB-1", "BLB-10")))).toEqual([
      "BLB-1",
    ]);
    expect(
      numbers(exactNumberOnly("OGN-202", rows("OGN-202", "OGN-202A", "OGN-20"))),
    ).toEqual(["OGN-202"]);
    expect(numbers(exactNumberOnly("GD01-001", rows("GD01-001", "GD01-002")))).toEqual([
      "GD01-001",
    ]);
  });

  it("leaves a partial number, a name, or a number nothing has alone", () => {
    const set = rows("OP12-001", "OP12-002");
    expect(exactNumberOnly("OP12", set)).toHaveLength(2);
    expect(exactNumberOnly("luffy", set)).toHaveLength(2);
    expect(exactNumberOnly("OP12-999", set)).toHaveLength(2);
  });
});
