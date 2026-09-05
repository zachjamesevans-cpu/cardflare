import { describe, expect, it } from "vitest";

import { GAME_IDS } from "@/lib/event-hub/game-profiles";
import {
  ALL_GAMES as WEB_ALL,
  resolveGameScope as webScope,
  searchPlaceholder as webPlaceholder,
  splitGames as webSplit,
} from "@/lib/cards/game-scope";
import { GAME_SLUGS, TCG_GAMES as WEB_GAMES } from "@/lib/players/games-catalog";
import {
  ALL_GAMES as APP_ALL,
  resolveGameScope as appScope,
  searchPlaceholder as appPlaceholder,
  splitGames as appSplit,
} from "../../mobile/src/game-scope";
import { TCG_GAMES as APP_GAMES } from "../../mobile/src/games";

/**
 * One list of games and one rule for which one a search looks in, on
 * both platforms. The app carries copies because it cannot import
 * across the package boundary; these hold the copies to the originals
 * so the two clients cannot default the same person to different games.
 */
describe("the games list", () => {
  it("is the same six on the website and in the app", () => {
    expect(APP_GAMES).toEqual(WEB_GAMES);
  });

  it("is the same six the Event Hub runs timers for", () => {
    expect([...GAME_IDS].sort()).toEqual([...GAME_SLUGS].sort());
  });
});

describe("the search scope", () => {
  const inputs = [
    {},
    { roomGame: "riftbound" },
    { roomGame: "nope", playerGames: ["mtg"] },
    { playerGames: ["pokemon", "one-piece"] },
    { playerGames: ["one-piece"], remembered: "mtg" },
    { playerGames: ["one-piece"], remembered: WEB_ALL },
    { remembered: "flesh-and-blood" },
    { roomGame: "one-piece", playerGames: ["pokemon"], remembered: WEB_ALL },
  ];

  it("resolves every case the same way on both platforms", () => {
    expect(APP_ALL).toBe(WEB_ALL);
    for (const input of inputs) {
      expect(appScope(input)).toEqual(webScope(input));
    }
  });

  it("splits the picker's list the same way: yours first, then the rest", () => {
    const scope = webScope({ playerGames: ["pokemon", "mtg"] });
    const web = webSplit(scope, ["pokemon", "mtg"]);
    expect(web.mine).toEqual(["pokemon", "mtg"]);
    expect(web.others).toEqual(
      GAME_SLUGS.filter((g) => g !== "pokemon" && g !== "mtg"),
    );
    expect(
      appSplit(appScope({ playerGames: ["pokemon", "mtg"] }), ["pokemon", "mtg"]),
    ).toEqual(web);
    expect(webSplit(webScope({}), []).mine).toEqual([]);
  });

  it("suggests the same card on both platforms", () => {
    for (const game of [...GAME_SLUGS, null]) {
      expect(appPlaceholder(game)).toBe(webPlaceholder(game));
    }
  });
});
