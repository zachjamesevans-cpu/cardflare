import { describe, expect, it } from "vitest";

import { ALL_GAMES, resolveGameScope, searchPlaceholder } from "@/lib/cards/game-scope";
import { GAME_SLUGS } from "@/lib/players/games-catalog";

/**
 * Which game a search looks in, from the founder's brief: the sign-up
 * game is pre-selected, a room's game is forced, and nobody is made to
 * wade through six games to find their own.
 */
describe("resolveGameScope", () => {
  it("locks to the room's game and offers no chips", () => {
    const scope = resolveGameScope({
      roomGame: "riftbound",
      playerGames: ["one-piece"],
      remembered: "mtg",
    });
    expect(scope).toEqual({ locked: true, selected: "riftbound", chips: [] });
  });

  it("ignores a room game it does not know", () => {
    const scope = resolveGameScope({ roomGame: "yugioh", playerGames: ["pokemon"] });
    expect(scope.locked).toBe(false);
    expect(scope.selected).toBe("pokemon");
  });

  it("pre-selects the first sign-up game and leads the chips with theirs", () => {
    const scope = resolveGameScope({ playerGames: ["pokemon", "mtg"] });
    expect(scope.selected).toBe("pokemon");
    expect(scope.chips.slice(0, 2)).toEqual(["pokemon", "mtg"]);
    expect(scope.chips).toHaveLength(GAME_SLUGS.length);
    expect(new Set(scope.chips).size).toBe(GAME_SLUGS.length);
  });

  it("lets the last tapped chip beat the sign-up default", () => {
    const scope = resolveGameScope({ playerGames: ["one-piece"], remembered: "mtg" });
    expect(scope.selected).toBe("mtg");
  });

  it('remembers "all" as a real choice', () => {
    const scope = resolveGameScope({
      playerGames: ["one-piece"],
      remembered: ALL_GAMES,
    });
    expect(scope.selected).toBeNull();
    expect(scope.chips[0]).toBe("one-piece");
  });

  it("searches every game for a guest with nothing remembered", () => {
    const scope = resolveGameScope({});
    expect(scope).toEqual({ locked: false, selected: null, chips: [...GAME_SLUGS] });
  });

  it("drops a remembered value it does not know", () => {
    expect(resolveGameScope({ remembered: "yugioh" }).selected).toBeNull();
  });
});

describe("searchPlaceholder", () => {
  it("shows a real card of the game in scope", () => {
    expect(searchPlaceholder("one-piece")).toContain("OP01-024");
    expect(searchPlaceholder("mtg")).toContain("Lightning Bolt");
    expect(searchPlaceholder("pokemon")).toContain("Charizard");
    expect(searchPlaceholder("flesh-and-blood")).toContain("MST131");
    expect(searchPlaceholder("riftbound")).toContain("OGN-056");
    expect(searchPlaceholder(null)).toBe("A card name or number");
  });
});
