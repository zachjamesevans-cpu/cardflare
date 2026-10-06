import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import * as web from "@/lib/binder/pocket-math";
import * as app from "../../mobile/src/pocket-math";

/**
 * Pockets, the same on the server, the website and the app. The
 * founder: "Adding a card in a specific slot should put that exact card
 * there." And: "I should be able to hold it down, and without lifting
 * finger start moving the cards around." The screens paint a move at
 * once with this; the database (binder_place_card) agrees with it.
 */

const cards = (pairs: [string, number][]) =>
  pairs.map(([entryId, pocket]) => ({ entryId, pocket }));
const at = (list: { entryId: string; pocket: number }[]) =>
  Object.fromEntries(list.map((card) => [card.entryId, card.pocket]));

for (const [name, lib] of [
  ["website", web],
  ["app", app],
] as const) {
  describe(`pocket math on the ${name}`, () => {
    it("drops into an empty pocket and leaves the gap behind", () => {
      const moved = lib.placeInPockets(
        cards([
          ["a", 0],
          ["b", 1],
          ["c", 2],
        ]),
        "c",
        8,
      );
      expect(at(moved)).toEqual({ a: 0, b: 1, c: 8 });
    });

    it("slides the run along to the next gap when the pocket is full", () => {
      const moved = lib.placeInPockets(
        cards([
          ["a", 0],
          ["b", 1],
          ["c", 2],
          ["d", 8],
        ]),
        "d",
        1,
      );
      expect(at(moved)).toEqual({ a: 0, d: 1, b: 2, c: 3 });
    });

    it("matches binder_place_card moving a card later into a full pocket", () => {
      /* The database run: newest@0 newold@1... see the migration's dry run. */
      const moved = lib.placeInPockets(
        cards([
          ["p1", 1],
          ["newest", 0],
          ["newold", 2],
          ["placed0", 3],
        ]),
        "newest",
        2,
      );
      expect(at(moved)).toEqual({ p1: 1, newest: 2, newold: 3, placed0: 4 });
    });

    it("finds the next empty pocket, coming round when the end is full", () => {
      expect(lib.nextFreePocket(new Set([0, 1, 3]), 0)).toBe(2);
      expect(lib.nextFreePocket(new Set([5]), 5)).toBe(6);
      const all = new Set(Array.from({ length: lib.LAST_POCKET }, (_, i) => i + 1));
      expect(lib.nextFreePocket(all, 10)).toBe(0);
    });

    it("draws enough pages, and one spare for the owner once the last is full", () => {
      expect(lib.pagesFor([], false)).toBe(1);
      expect(lib.pagesFor(cards([["a", 10]]), false)).toBe(2);
      const full = cards(
        Array.from({ length: 9 }, (_, i) => [`c${i}`, i] as [string, number]),
      );
      expect(lib.pagesFor(full, true)).toBe(2);
      expect(lib.pagesFor(full, false)).toBe(1);
    });

    it("lays one page out by pocket, gaps and all", () => {
      const page = lib.pageOf(
        cards([
          ["a", 9],
          ["b", 17],
        ]),
        1,
      );
      expect(page[0]?.entryId).toBe("a");
      expect(page[8]?.entryId).toBe("b");
      expect(page[4]).toBeUndefined();
    });
  });
}

describe("the two files", () => {
  it("are the same code", () => {
    const strip = (text: string) =>
      text.slice(text.indexOf("export const POCKETS_PER_PAGE"));
    expect(strip(readFileSync("mobile/src/pocket-math.ts", "utf8"))).toBe(
      strip(readFileSync("src/lib/binder/pocket-math.ts", "utf8")),
    );
  });
});
