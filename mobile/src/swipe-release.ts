/**
 * What letting go of a swiped row does (swipe-delete.tsx), on its own so
 * the unit tests can hold it: React Native cannot be imported there.
 */

/** How wide the Delete is when a short swipe leaves it showing. */
export const ACTION_WIDTH = 88;
/** Past this share of the row's width, letting go deletes. */
export const FULL_SWIPE = 0.5;

/** Past the line: a long swipe, armed to delete on release. */
export function pastFullSwipe(translation: number, width: number): boolean {
  "worklet";
  return width > 0 && -translation > width * FULL_SWIPE;
}

/** From where the row is and how fast it moved. */
export function swipeRelease(
  translation: number,
  velocity: number,
  width: number,
): "delete" | "open" | "close" {
  "worklet";
  if (pastFullSwipe(translation, width)) return "delete";
  /* A flick back to the right closes, wherever it is. */
  if (velocity > 400) return "close";
  return -translation > ACTION_WIDTH / 2 ? "open" : "close";
}
