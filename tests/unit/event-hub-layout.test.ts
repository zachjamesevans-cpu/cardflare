import { describe, expect, it } from "vitest";

import {
  displayPlan,
  MAX_TIMERS,
  resolveLayout,
  type LayoutChoice,
} from "@/lib/event-hub/layout";
import { rotationCycleLength, rotationWindow } from "@/lib/event-hub/rotation";

/**
 * How the television divides itself up, and whose card is on it.
 *
 * Both are pure, and both are decisions a shop would notice getting
 * wrong: a hidden tournament, or the same three people owning the board
 * all night.
 */

describe("choosing a layout", () => {
  it.each([
    [0, "single"],
    [1, "single"],
    [2, "split"],
    [3, "grid"],
    [4, "grid"],
  ])("auto picks %s for %i timers", (count, expected) => {
    expect(resolveLayout("auto", count)).toBe(expected);
  });

  it("honours a roomier layout than the room needs", () => {
    /* A lone timer in a grid cell is a legitimate thing to want on a
       small screen, so a deliberate choice is not overruled. */
    expect(resolveLayout("grid", 1)).toBe("grid");
    expect(resolveLayout("split", 1)).toBe("split");
  });

  it("widens a layout rather than hiding a running tournament", () => {
    /* The rule that matters: a store picked SPLIT, then started a third
       tournament. Hiding it from the room is a worse failure than
       overriding the preference. */
    expect(resolveLayout("single", 2)).toBe("split");
    expect(resolveLayout("single", 3)).toBe("grid");
    expect(resolveLayout("split", 4)).toBe("grid");
  });

  it.each<[LayoutChoice, number]>([
    ["auto", 1],
    ["auto", 2],
    ["auto", 3],
    ["auto", 4],
    ["single", 4],
    ["split", 3],
  ])("never drops a timer for %s with %i", (choice, count) => {
    const plan = displayPlan(choice, count);
    const capacity = plan.layout === "single" ? 1 : plan.layout === "split" ? 2 : 4;

    expect(capacity).toBeGreaterThanOrEqual(count);
  });
});

describe("allocating the screen", () => {
  it("gives one tournament a full board", () => {
    expect(displayPlan("auto", 1)).toEqual({
      layout: "single",
      columns: 1,
      flareShape: "board",
      flareSlots: 4,
    });
  });

  it("gives two tournaments a carousel", () => {
    expect(displayPlan("auto", 2)).toEqual({
      layout: "split",
      columns: 2,
      flareShape: "carousel",
      flareSlots: 3,
    });
  });

  it.each([3, 4])("gives %i tournaments a strip and two columns", (count) => {
    const plan = displayPlan("auto", count);

    expect(plan.layout).toBe("grid");
    /* Two columns, not four: a 1366x768 projector cannot make four
       side-by-side countdowns readable from across a shop. */
    expect(plan.columns).toBe(2);
    expect(plan.flareShape).toBe("strip");
  });

  it("shrinks the board as tournaments take the screen", () => {
    const slots = [1, 2, 3].map((count) => displayPlan("auto", count).flareSlots);
    /* Never increasing: timers are the most important thing on the wall
       while tournaments are running. */
    expect(slots).toEqual([...slots].sort((a, b) => b - a));
  });

  it("holds four tournaments and no more", () => {
    expect(MAX_TIMERS).toBe(4);
  });
});

describe("rotating the Flare board", () => {
  const cards = Array.from({ length: 12 }, (_, index) => `card-${index}`);

  it("shows everything when everything fits", () => {
    expect(rotationWindow(["a", "b"], 4, 0)).toEqual(["a", "b"]);
    expect(rotationWindow(["a", "b"], 4, 99)).toEqual(["a", "b"]);
  });

  it("shows nothing when there is nothing", () => {
    expect(rotationWindow([], 4, 3)).toEqual([]);
  });

  it("reaches every card before repeating anybody", () => {
    /* The fairness rule. Showing the first three forever would mean the
       three people who posted earliest own the television all night,
       which is what stops the rest of the room posting. */
    const seen = new Set<string>();
    for (let tick = 0; tick < rotationCycleLength(cards.length, 3); tick += 1) {
      for (const card of rotationWindow(cards, 3, tick)) seen.add(card);
    }

    expect(seen.size).toBe(cards.length);
  });

  it("stays inside the list after eight hours of ticking", () => {
    /* A display open all night ticks thousands of times; the offset must
       not walk off the end of the array. */
    for (const tick of [0, 1, 500, 3_600, 99_999]) {
      const window = rotationWindow(cards, 3, tick);

      expect(window).toHaveLength(3);
      for (const card of window) expect(cards).toContain(card);
    }
  });

  it("never repeats a card inside one window", () => {
    for (let tick = 0; tick < 20; tick += 1) {
      const window = rotationWindow(cards, 5, tick);
      expect(new Set(window).size).toBe(window.length);
    }
  });

  it("handles a list that does not divide evenly by the window", () => {
    const seven = Array.from({ length: 7 }, (_, index) => index);
    const seen = new Set<number>();

    for (let tick = 0; tick < 20; tick += 1) {
      for (const card of rotationWindow(seven, 3, tick)) seen.add(card);
    }

    expect(seen.size).toBe(7);
  });
});
