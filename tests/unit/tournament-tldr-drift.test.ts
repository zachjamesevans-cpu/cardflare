import { describe, expect, it } from "vitest";

import {
  GAME_IDS,
  GAME_PROFILES,
  NIGHT_BASICS as WEB_BASICS,
} from "@/lib/event-hub/game-profiles";
import {
  GAME_TLDRS,
  NIGHT_BASICS as APP_BASICS,
} from "../../mobile/src/tournament-tldr";

/**
 * One first-tournament guide, on both platforms.
 *
 * The website renders it from game-profiles.ts; the app carries a
 * mirror because it cannot import across the package boundary. Two
 * copies of advice that drift teach two different sets of rules under
 * one brand, which is worse than either copy being wrong.
 */
describe("the app's tournament guide against the website's", () => {
  it("tells the same story about a night", () => {
    expect(APP_BASICS).toEqual(WEB_BASICS);
  });

  it("covers every game, by the website's own names", () => {
    expect(GAME_TLDRS.map((game) => game.id)).toEqual([...GAME_IDS]);

    for (const game of GAME_TLDRS) {
      expect(game.name).toBe(
        GAME_PROFILES[game.id as (typeof GAME_IDS)[number]].displayName,
      );
    }
  });

  it("gives every game the same advice", () => {
    for (const game of GAME_TLDRS) {
      expect(game.lines).toEqual(
        GAME_PROFILES[game.id as (typeof GAME_IDS)[number]].beginnerTldr,
      );
    }
  });
});
