import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import * as web from "@/lib/search/rank";
import * as app from "../../mobile/src/search-rank";

/**
 * Search ordered by how well things match, the same on both platforms.
 * The founder: "When I search for someone named Luffy as a username, a
 * bunch of Luffy cards pop up, with the username being all the way at
 * the bottom."
 */

for (const [name, lib] of [
  ["website", web],
  ["app", app],
] as const) {
  describe(`search ranking on the ${name}`, () => {
    it("scores exact over starts-with over a word over contains", () => {
      expect(lib.matchScore("luffy", ["Luffy"])).toBe(4);
      expect(lib.matchScore("luffy", ["LuffyFan99"])).toBe(3);
      expect(lib.matchScore("luffy", ["Monkey.D.Luffy"])).toBe(2);
      expect(lib.matchScore("uff", ["Luffy"])).toBe(1);
      expect(lib.matchScore("zoro", ["Luffy"])).toBe(0);
      expect(lib.matchScore("luffy", [null, "", "@luffy"])).toBe(4);
    });

    it("puts a player called Luffy above the Luffy cards", () => {
      const players = [{ name: "Luffy" }];
      const best = Math.max(...players.map((p) => lib.matchScore("luffy", [p.name])));
      expect(lib.topOrder(best, 0)).toEqual(["players", "cards", "stores"]);
      expect(lib.topOrder(1, 0)).toEqual(["cards", "players", "stores"]);
      expect(lib.topOrder(0, 4)).toEqual(["stores", "cards", "players"]);
    });

    it("reads @ as players only", () => {
      expect(lib.readQuery("  @luffy ")).toEqual({ text: "luffy", playersOnly: true });
      expect(lib.readQuery("luffy")).toEqual({ text: "luffy", playersOnly: false });
    });

    it("keeps the server's order among equal matches", () => {
      const ranked = lib.rankBy(["b", "a", "c"], (v) => (v === "c" ? 2 : 1));
      expect(ranked).toEqual(["c", "b", "a"]);
    });
  });
}

describe("the two files", () => {
  it("are the same code", () => {
    const strip = (text: string) => text.slice(text.indexOf("export type SearchTab"));
    expect(strip(readFileSync("mobile/src/search-rank.ts", "utf8"))).toBe(
      strip(readFileSync("src/lib/search/rank.ts", "utf8")),
    );
  });
});
