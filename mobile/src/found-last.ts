/**
 * Found cards last. The founder: "if a card is found, it gets moved to
 * the far right so the most pertinent flares are always front and
 * center", and again (2026-10-12): "cards that are found should go all
 * the way to the right of the feed once they are found." A stable sort,
 * so the open cards keep the order they were posted in. The website's
 * is `foundLast` in src/lib/feed/card-copy.ts, the same rule.
 *
 * The server already sends them in this order; the Feed sorts again as
 * it draws, because a card ticked found on this phone, a cached Feed and
 * demo mode all reach the screen without passing back through it.
 */
export const foundLast = <T extends { state?: string }>(a: T, b: T): number =>
  Number(a.state === "found") - Number(b.state === "found");
