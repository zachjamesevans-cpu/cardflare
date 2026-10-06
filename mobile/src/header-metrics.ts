/**
 * The measurements every header in the app is built from.
 *
 * The founder: "make sure everything is pixel perfect in terms of
 * location on the page - like, the 3 dots on one page should be exactly
 * the same elsewhere." Before this file each screen sized its own: a
 * 26pt chevron with 12pt of padding on one side, a 22pt ellipsis with
 * none, a 21pt bell, a pencil at 22. So nothing lined up from one
 * screen to the next, and inside iOS 26's glass circles all of it sat
 * off centre.
 *
 * One box for every button, one size for every glyph, one distance
 * from the edge. The Feed's floating header, the pushed screens and the
 * tab screens all read these numbers, so the ellipsis on a
 * conversation lands on exactly the pixels the bell holds on the Feed.
 *
 * Kept free of React Native imports so the tests can read the numbers.
 */
export const HEADER = {
  /** The bar under the status bar, on every screen. */
  height: 52,
  /** Every header button's tap box, square: Apple's 44pt minimum. */
  slot: 44,
  /** The box's distance from the screen's edge. */
  edge: 6,
  /** Every header glyph, the same size. */
  icon: 24,
} as const;

/** Where a glyph's outer edge lands: 16pt in, the screen's text margin. */
export const HEADER_ICON_INSET = HEADER.edge + (HEADER.slot - HEADER.icon) / 2;
