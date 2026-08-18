import { describe, expect, it } from "vitest";

import {
  allProfiles,
  GAME_IDS,
  GAME_PROFILES,
  gameProfile,
  nameRepeatsGame,
  procedureFor,
  RULES_DISCLAIMER,
  timerPreset,
  type GameId,
} from "@/lib/event-hub/game-profiles";
import { overtimeSecondsFor } from "@/lib/event-hub/schema";

/**
 * The rules the television puts on a shop's wall.
 *
 * These are assertions about DATA, which is the point of the profiles
 * existing at all: a publisher changing an end-of-round procedure should
 * be an edit to a string array and a bumped `procedureVersion`, not a
 * rebuild of a timer component. What is tested here is the shape those
 * summaries have to keep — short, numbered, honest about what they are —
 * plus the specific structural facts each game's procedure turns on.
 *
 * DEVELOPER NOTE: passing these does not mean the rules are current.
 * They must be reviewed against official publisher documentation
 * periodically. That is what `rulesLastVerified` is for.
 */

const FIVE: GameId[] = [
  "one-piece",
  "pokemon",
  "lorcana",
  "riftbound",
  "flesh-and-blood",
];

describe("the five games", () => {
  it("is exactly the five, and no more", () => {
    /* Version one supports five. Magic, Yu-Gi-Oh and the rest arrive by
       adding a profile, which is deliberately a code change. */
    expect([...GAME_IDS]).toEqual(FIVE);
    expect(allProfiles()).toHaveLength(5);
  });

  it("refuses a game it does not carry", () => {
    expect(gameProfile("mtg")).toBeNull();
    expect(gameProfile("")).toBeNull();
  });

  it.each(FIVE)("%s carries everything a rules update needs", (id) => {
    const profile = GAME_PROFILES[id];

    expect(profile.officialRulesUrl).toMatch(/^https:\/\//);
    /* An ISO date, so "when did anybody last check this" is answerable
       from the screen rather than from a changelog. */
    expect(profile.rulesLastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(profile.procedureVersion.length).toBeGreaterThan(0);
    expect(profile.presets.length).toBeGreaterThan(0);
    expect(timerPreset(id, profile.defaultPresetId)).not.toBeNull();
  });

  it.each(FIVE)("%s keeps both procedures readable across a room", (id) => {
    for (const bracket of ["swiss", "elimination"] as const) {
      const procedure = procedureFor(GAME_PROFILES[id], bracket);

      /* Three to six steps. A wall of policy text is exactly what this
         feature replaces. */
      expect(procedure.steps.length).toBeGreaterThanOrEqual(3);
      expect(procedure.steps.length).toBeLessThanOrEqual(6);
      expect(procedure.headline.length).toBeLessThanOrEqual(28);

      for (const step of procedure.steps) {
        expect(step.length).toBeLessThanOrEqual(160);
      }
    }
  });

  it.each(FIVE)("%s only claims a countdown when it has one", (id) => {
    for (const bracket of ["swiss", "elimination"] as const) {
      const procedure = procedureFor(GAME_PROFILES[id], bracket);

      /* The invariant the whole overtime UI leans on: an untimed
         procedure must not carry seconds, or the display would start a
         clock the publisher never specified. */
      if (!procedure.timed) expect(procedure.overtimeSeconds).toBeNull();
      else expect(procedure.overtimeSeconds).toBeGreaterThan(0);
    }
  });

  it("gives every game a distinct accent token", () => {
    const tokens = FIVE.map((id) => GAME_PROFILES[id].accentToken);
    expect(new Set(tokens).size).toBe(5);
    /* A token name, never a literal — brand colour lives in globals.css. */
    for (const token of tokens) expect(token).toMatch(/^--color-game-/);
  });

  it("says out loud that it is not the rules authority", () => {
    expect(RULES_DISCLAIMER).toContain("Quick reference only");
    expect(RULES_DISCLAIMER).toContain("judges");
  });
});

describe("One Piece", () => {
  const profile = GAME_PROFILES["one-piece"];

  it("defaults to the 35-minute Store Tournament", () => {
    expect(profile.defaultPresetId).toBe("store-tournament");
    expect(timerPreset("one-piece", "store-tournament")?.durationSeconds).toBe(35 * 60);
    expect(timerPreset("one-piece", "standard-qualifying")?.durationSeconds).toBe(
      30 * 60,
    );
    expect(timerPreset("one-piece", "top-cut")?.durationSeconds).toBe(60 * 60);
    expect(timerPreset("one-piece", "top-cut")?.overtimeSeconds).toBe(10 * 60);
  });

  it("runs a five-minute extra time over three turns", () => {
    expect(profile.swiss.timed).toBe(true);
    expect(profile.swiss.overtimeSeconds).toBe(5 * 60);
    expect(profile.swiss.additionalTurns).toBe(3);
    expect(profile.swiss.steps[0]).toContain("Turn 0");
  });

  it("compares Life, then deck, then Characters, then who last lost Life", () => {
    expect(profile.swiss.tiebreak).toEqual([
      "Most Life cards remaining",
      "Most cards remaining in deck",
      "Most Characters in the Character area",
      "Whoever most recently removed a card from their Life",
    ]);
    expect(profile.elimination.tiebreak).toEqual(profile.swiss.tiebreak);
  });

  it("allows a draw in Swiss and refuses one in elimination", () => {
    expect(profile.swiss.steps.join(" ")).toContain("draw");
    expect(profile.elimination.steps[0]).toContain("Draws are not permitted");
  });
});

describe("Pokémon", () => {
  const profile = GAME_PROFILES.pokemon;

  it("labels the +3 turn procedure as Championship Series, not as every event", () => {
    /* Telling a shop their Tuesday league must run the championship
       structure would be inventing tournament policy. */
    const championship = timerPreset("pokemon", "championship-bo3");
    expect(championship?.label).toContain("Championship Series");
    expect(championship?.durationSeconds).toBe(50 * 60);
    expect(championship?.overtimeSeconds).toBe(15 * 60);

    const casual = timerPreset("pokemon", "prerelease-bo1");
    expect(casual?.durationSeconds).toBe(30 * 60);
    expect(casual?.overtimeSeconds).toBeNull();
    expect(casual?.note).toContain("your event's own end-of-round rules");
  });

  it("runs three additional turns on a fifteen-minute clock", () => {
    expect(profile.swiss.additionalTurns).toBe(3);
    expect(profile.swiss.overtimeSeconds).toBe(15 * 60);
    expect(profile.swiss.steps.join(" ")).toContain("opponent takes the first");
  });

  it("sends an unresolved match to a judge rather than inventing policy", () => {
    expect(profile.swiss.steps.join(" ")).toContain("Tournament Handbook");
    expect(profile.elimination.steps.join(" ")).toContain("Judge");
  });

  it("carries none of the retired procedures", () => {
    const everything = JSON.stringify(profile).toLowerCase();
    /* The old one-Prize "Sudden Death" and "+1 turn" language is wrong
       now, and wrong on a wall is worse than absent. */
    expect(everything).not.toContain("sudden death");
    expect(everything).not.toContain("+1 turn");
  });
});

describe("Lorcana", () => {
  const profile = GAME_PROFILES.lorcana;

  it("counts five turns and starts no clock", () => {
    expect(profile.swiss.headline).toBe("+5 TURNS");
    expect(profile.swiss.additionalTurns).toBe(5);
    expect(profile.swiss.timed).toBe(false);
    expect(overtimeSecondsFor("lorcana", "swiss")).toBeNull();
  });

  it("says plainly that Turn 0 is not one of the five", () => {
    expect(profile.swiss.steps.join(" ")).toContain("Turn 0 is not one of the five");
  });

  it("decides elimination on Lore, and keeps playing until somebody leads", () => {
    const steps = profile.elimination.steps.join(" ");
    expect(steps).toContain("Compare Lore");
    expect(steps).toContain("first player to take the Lore lead wins");
  });

  it("offers an untimed single elimination", () => {
    expect(timerPreset("lorcana", "single-elimination")?.durationSeconds).toBeNull();
    expect(timerPreset("lorcana", "swiss")?.durationSeconds).toBe(50 * 60);
  });
});

describe("Riftbound", () => {
  const profile = GAME_PROFILES.riftbound;

  it("plays five untimed additional turns", () => {
    expect(profile.swiss.headline).toContain("+5 TURNS");
    expect(profile.swiss.timed).toBe(false);
    expect(profile.swiss.steps.join(" ")).toContain("untimed");
  });

  it("does not start another game when time expires between games", () => {
    expect(profile.swiss.steps.join(" ")).toContain("Do not start another game");
  });

  it("defaults to fifty minutes with an untimed playoff", () => {
    expect(timerPreset("riftbound", "swiss")?.durationSeconds).toBe(50 * 60);
    expect(timerPreset("riftbound", "playoff")?.durationSeconds).toBeNull();
  });
});

describe("Flesh and Blood", () => {
  const profile = GAME_PROFILES["flesh-and-blood"];

  it("plays exactly one additional turn, with no invented countdown", () => {
    expect(profile.swiss.headline).toBe("+1 TURN");
    expect(profile.swiss.additionalTurns).toBe(1);
    expect(profile.swiss.timed).toBe(false);
    expect(overtimeSecondsFor("flesh-and-blood", "swiss")).toBeNull();
  });

  it("carries the official recommended round times", () => {
    expect(profile.defaultPresetId).toBe("classic-constructed");
    expect(timerPreset("flesh-and-blood", "classic-constructed")?.durationSeconds).toBe(
      55 * 60,
    );
    expect(timerPreset("flesh-and-blood", "blitz")?.durationSeconds).toBe(35 * 60);
    expect(timerPreset("flesh-and-blood", "sealed-deck")?.durationSeconds).toBe(
      35 * 60,
    );
    expect(timerPreset("flesh-and-blood", "booster-draft")?.durationSeconds).toBe(
      35 * 60,
    );
    expect(timerPreset("flesh-and-blood", "welcome-deck")?.durationSeconds).toBe(
      30 * 60,
    );
  });

  it("sends elimination straight to a judge", () => {
    expect(profile.elimination.headline).toBe("CALL A JUDGE");
    expect(profile.elimination.steps[0]).toContain("Call a Judge");
    expect(profile.elimination.steps.join(" ")).toContain("higher pre-match standing");
  });
});

describe("switching between Swiss and elimination", () => {
  it.each(FIVE)("%s gives a different procedure for each", (id) => {
    const profile = GAME_PROFILES[id];

    expect(procedureFor(profile, "swiss")).toBe(profile.swiss);
    expect(procedureFor(profile, "elimination")).toBe(profile.elimination);
  });

  it("changes the overtime a control panel would start", () => {
    /* One Piece is timed either way; Lorcana is timed neither way. The
       switch has to be read through the procedure, never hardcoded. */
    expect(overtimeSecondsFor("one-piece", "swiss")).toBe(5 * 60);
    expect(overtimeSecondsFor("one-piece", "elimination")).toBe(5 * 60);
    expect(overtimeSecondsFor("lorcana", "elimination")).toBeNull();
    expect(overtimeSecondsFor("riftbound", "elimination")).toBeNull();
  });
});

/**
 * A tournament's name is not the game's name again.
 *
 * From a shop floor: "in the event hub it says 'one piece card game' and
 * 'one piece card game' in the timer screen, twice." The panel is headed
 * by the game and the form used to pre-fill the tournament name with the
 * game's own name, so both lines said the same thing and the line that
 * should carry "Friday Night Locals" carried nothing.
 *
 * The same rule cosmetics already follow: a name never repeats the
 * category it is sitting under.
 */
describe("a tournament name that repeats its game", () => {
  it.each([
    ["One Piece Card Game", "one-piece"],
    ["One Piece", "one-piece"],
    ["one piece tcg", "one-piece"],
    ["Pokémon TCG", "pokemon"],
    ["Lorcana", "lorcana"],
    ["Flesh & Blood", "flesh-and-blood"],
    ["   ", "one-piece"],
  ])("spots %j under %s", (name, id) => {
    expect(nameRepeatsGame(GAME_PROFILES[id as GameId], name)).toBe(true);
  });

  it.each([
    ["Friday Night Locals", "one-piece"],
    ["Armory: Classic Constructed", "flesh-and-blood"],
    ["Release Weekend", "pokemon"],
    ["Store Championship", "lorcana"],
  ])("leaves %j alone under %s", (name, id) => {
    expect(nameRepeatsGame(GAME_PROFILES[id as GameId], name)).toBe(false);
  });
});
