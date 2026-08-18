/**
 * Which Flares are on the wall this moment.
 *
 * A shop's board can hold thirty cards and the screen can hold three, so
 * something has to choose — and the choice has to be fair. Showing the
 * first three forever would mean the three people who posted earliest
 * own the television all night, which is exactly the outcome that makes
 * the rest of the room stop posting.
 *
 * So the window walks: every tick advances by a full window, and the
 * cycle wraps. Everybody's card reaches the wall before anybody's card
 * reaches it twice.
 */

/**
 * The slice visible at `tick`.
 *
 * `tick` is a counter the display increments, not a clock — which keeps
 * this a pure function and makes it trivial to assert that four ticks
 * over twelve cards touch all twelve.
 */
export function rotationWindow<T>(
  items: readonly T[],
  slots: number,
  tick: number,
): T[] {
  if (items.length === 0 || slots <= 0) return [];
  if (items.length <= slots) return [...items];

  const width = Math.min(slots, items.length);
  /* Modulo before multiplying keeps the offset inside the array even
     after a display has been open for eight hours and ticked thousands
     of times. */
  const start = ((tick % items.length) * width) % items.length;

  return Array.from(
    { length: width },
    (_, index) => items[(start + index) % items.length],
  );
}

/** How many ticks it takes to show everything once. */
export function rotationCycleLength(count: number, slots: number): number {
  if (count === 0 || slots <= 0) return 0;
  if (count <= slots) return 1;
  return Math.ceil(count / slots);
}
