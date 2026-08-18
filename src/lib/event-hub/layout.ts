/**
 * How the television divides itself up.
 *
 * The rule underneath every decision here: while tournaments are
 * running, the timers are the most important thing on the wall, and the
 * Flare board takes whatever is left. One tournament leaves a lot left;
 * four leave a strip.
 */

/** What a store picked. `auto` lets the room decide. */
export type LayoutChoice = "auto" | "single" | "split" | "grid";

export const LAYOUT_CHOICES: readonly LayoutChoice[] = [
  "auto",
  "single",
  "split",
  "grid",
];

/** What the display actually renders. */
export type ResolvedLayout = "single" | "split" | "grid";

/** How the Flare board is shaped in the space the timers left over. */
export type FlareShape = "board" | "carousel" | "strip";

export interface DisplayPlan {
  layout: ResolvedLayout;
  /** Columns in the timer area. */
  columns: number;
  flareShape: FlareShape;
  /** Flares visible at once. */
  flareSlots: number;
}

/** The most timers a layout can show without hiding one. */
const CAPACITY: Record<ResolvedLayout, number> = {
  single: 1,
  split: 2,
  grid: 4,
};

/**
 * The layout, given what a store asked for and what is actually running.
 *
 * A chosen layout is only ever upgraded, never downgraded. A store that
 * picked SPLIT and then started a third tournament gets a grid, because
 * hiding a running tournament from the room is a worse failure than
 * overriding a preference — the display's whole job is telling people
 * what is on. Picking a roomier layout than you need is honoured: a lone
 * timer in a grid cell is a legitimate thing to want on a small screen.
 */
export function resolveLayout(
  choice: LayoutChoice,
  timerCount: number,
): ResolvedLayout {
  const needed: ResolvedLayout =
    timerCount <= 1 ? "single" : timerCount === 2 ? "split" : "grid";

  if (choice === "auto") return needed;

  return CAPACITY[choice] >= timerCount ? choice : needed;
}

/**
 * The whole allocation, in one object.
 *
 * Returned together rather than as four hooks so the display cannot end
 * up in a state where the timers think they are in a grid and the Flare
 * board thinks it has half the screen.
 */
export function displayPlan(choice: LayoutChoice, timerCount: number): DisplayPlan {
  const layout = resolveLayout(choice, timerCount);

  switch (layout) {
    case "single":
      /* One tournament: the timer is enormous and the board gets real
         estate worth looking at from the back of the shop. */
      return { layout, columns: 1, flareShape: "board", flareSlots: 4 };
    case "split":
      return { layout, columns: 2, flareShape: "carousel", flareSlots: 3 };
    case "grid":
      /* Two columns rather than four: a 1366x768 projector cannot make
         four side-by-side countdowns readable across a room. */
      return { layout, columns: 2, flareShape: "strip", flareSlots: 2 };
  }
}

/** The most timers one display will hold. Beyond this nothing is legible. */
export const MAX_TIMERS = 4;
