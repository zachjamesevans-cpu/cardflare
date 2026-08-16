/**
 * The order a player's rail puts its cards in — the app's copy of the
 * website's `inRailOrder` in `src/lib/matching/schema.ts`, kept identical
 * on purpose, the same way `held-label.ts` and `pack-labels.ts` are.
 *
 * Two rules, and they can disagree. Cards you can answer come first: the
 * founder's replacement for the old "you have 2 of 6" badge, because a rail
 * you can only read the front of should open on the part that concerns you.
 * Fully pledged hunts park at the far end, dimmed but present, so the
 * bring-extras crowd can still see the ask.
 *
 * When both apply, settled outranks interesting: a card you hold that
 * somebody else has already promised belongs at the end with the rest of
 * the settled ones, not at the front pretending to need you.
 */
export function inRailOrder<T>(
  items: T[],
  held: (item: T) => boolean,
  covered: (item: T) => boolean,
): T[] {
  return [
    ...items.filter((item) => !covered(item) && held(item)),
    ...items.filter((item) => !covered(item) && !held(item)),
    ...items.filter(covered),
  ];
}
