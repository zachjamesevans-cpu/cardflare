import { describe, expect, it } from "vitest";

import {
  MILESTONES,
  TIER_PACKS,
  milestoneRef,
  progressOf,
  tierPackRef,
  tiersReached,
} from "@/lib/players/milestone-rules";

/**
 * Milestones, from the Embers review (2026-10-11): earning came almost
 * only from trades and the badge tiers unlocked nothing. Each milestone
 * pays once, for something hard to fake, and each badge tier reached
 * hands over a sealed pack.
 */

const nothing = { flares: 0, trades: 0, partners: 0, huntsFinished: 0, storeVisits: 0 };

describe("milestones", () => {
  it("are all unmet for a new player, and none pays more than a pack is worth", () => {
    for (const milestone of progressOf(nothing)) {
      expect(milestone.done).toBe(false);
      expect(milestone.progress).toBe(0);
    }
    for (const milestone of MILESTONES) {
      expect(milestone.embers).toBeGreaterThan(0);
      expect(milestone.embers).toBeLessThanOrEqual(100);
    }
  });

  it("count progress up to the goal and no further", () => {
    const board = progressOf({ ...nothing, partners: 7, huntsFinished: 1 });
    const byKey = Object.fromEntries(board.map((entry) => [entry.key, entry]));
    expect(byKey["partners-5"]).toMatchObject({ progress: 5, done: true });
    expect(byKey["partners-10"]).toMatchObject({ progress: 7, done: false });
    expect(byKey["hunt-1"].done).toBe(true);
    expect(byKey["hunt-3"]).toMatchObject({ progress: 1, done: false });
  });

  it("pay each one once per player, by ref", () => {
    expect(milestoneRef("p1", "first-trade")).toBe("milestone:first-trade:p1");
    expect(milestoneRef("p1", "first-trade")).not.toBe(
      milestoneRef("p2", "first-trade"),
    );
    expect(new Set(MILESTONES.map((entry) => entry.key)).size).toBe(MILESTONES.length);
  });
});

describe("tier packs", () => {
  it("follow the badge's own ladder", () => {
    expect(TIER_PACKS.map((step) => step.earned)).toEqual([50, 200, 600, 1500]);
    expect(tiersReached(0)).toEqual([]);
    expect(tiersReached(49)).toEqual([]);
    expect(tiersReached(200)).toEqual(["Kindling", "Blaze"]);
    expect(tiersReached(5000)).toHaveLength(4);
  });

  it("hand over each tier's pack once, by ref", () => {
    expect(tierPackRef("p1", "Blaze")).toBe("tier-pack:blaze:p1");
  });
});
