/**
 * Every icon button in a header, on every player page: one box, one
 * glyph size, no bubble.
 *
 * The founder: "remove all of these weird 'bubbles' around icons - they
 * all seem kinda off center", and "the 3 dots on one page should be
 * exactly the same elsewhere." The website drew a bordered circle
 * around each header icon at 36px with a 16px glyph, and its menus and
 * back link each picked their own size. Now they share these strings,
 * the same numbers the app's header reads (mobile/src/header-metrics.ts):
 * a 44px box, a 24px glyph in its middle. No margins of its own: the
 * page's gutter places it, so on a phone every header glyph sits the
 * same 18px from the edge, whichever side and whichever page. The
 * rounding is only there so the keyboard focus ring is a circle;
 * nothing is drawn behind the glyph.
 */
const BOX =
  "relative flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-wait";

export const HEADER_BUTTON = `${BOX} text-text-primary hover:text-accent`;

/**
 * Back: the same box, the chevron in the accent as the app draws it. Its
 * own string rather than a colour added on top, because `cn` joins
 * classes without resolving them, and two text colours on one element
 * is a coin toss decided by stylesheet order.
 */
export const HEADER_BACK = `${BOX} text-accent hover:text-accent-hover`;

/** The glyph inside it. */
export const HEADER_ICON = "size-6";
