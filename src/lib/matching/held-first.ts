/**
 * Cards you hold first, everything else after, each half in the order it
 * came.
 *
 * The founder (2026-10-09): "those cards should show all the way to the
 * left if that user has the card so it's front and center. My goal is to
 * not make things too complicated." So one rule, everywhere somebody
 * else's wanted cards are drawn as a row: the green ring says which, and
 * the order puts them where a rail that only shows its front still shows
 * them. Exact and other-printing are the same ring, so they are the same
 * half here too.
 *
 * Applied on the server, to the cards WITHIN one row, so the website and
 * the app draw the same order from the same data. Never to the rows
 * themselves (posts, players, Feed items keep their own order) and never
 * to binder pockets, which their owners arrange by hand.
 *
 * Stable by construction: two filters over the same array, so a row with
 * nothing held, or everything held, comes back exactly as it went in.
 * Free of server-only imports so a test can hold it.
 */
export function heldFirst<T>(items: T[], held: (item: T) => boolean): T[] {
  return [...items.filter(held), ...items.filter((item) => !held(item))];
}
