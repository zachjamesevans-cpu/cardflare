import { describe, expect, it } from "vitest";

import { GAME_PROFILES } from "@/lib/event-hub/game-profiles";
import { roundReadyLine, timeCalledLine } from "@/lib/event-hub/voice";

/**
 * The organizer's voice says the founder's sentence and nothing else:
 * "(insert game name here) is ready for (insert round here)". Held
 * here because the pitch page quotes it and the control panel speaks
 * it, and the two must never drift.
 */
describe("the organizer's voice", () => {
  it("says the game is ready for the round, in those words", () => {
    expect(roundReadyLine(GAME_PROFILES["one-piece"], 4)).toBe(
      "One Piece is ready for round 4.",
    );
    expect(roundReadyLine(GAME_PROFILES.mtg, 1)).toBe("Magic is ready for round 1.");
  });

  it("calls time with the round when it has one", () => {
    expect(timeCalledLine(GAME_PROFILES.pokemon, 3)).toBe("Pokémon: time in round 3.");
    expect(timeCalledLine(GAME_PROFILES.pokemon, null)).toBe(
      "Pokémon: time in the round.",
    );
  });
});
