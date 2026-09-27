import type { FeedCard } from "@/lib/feed/repository";

/**
 * The one line under a card's name on a post: "Need 2 more", "2
 * available", "Found".
 *
 * A plain module on purpose. It is read by the server-rendered feed
 * card for a single-card post and by the client-side carousel and
 * sheet for the rest, and a function exported from a "use client" file
 * cannot be CALLED on the server, only rendered - the Feed went down
 * in production the first time a one-card post met it there.
 * tests/unit/client-boundary.test.ts keeps the next helper out of the
 * same trap.
 */
/**
 * Found cards last. The founder: "if a card is found, it gets moved to
 * the far right so the most pertinent flares are always front and
 * center." A stable sort, so the open cards keep the order they were
 * posted in.
 */
export const foundLast = <T extends { state?: string }>(a: T, b: T): number =>
  Number(a.state === "found") - Number(b.state === "found");

export function cardCountLabel(card: FeedCard, direction: "want" | "showcase"): string {
  const quantity = card.quantity ?? 1;
  if (direction === "showcase") {
    if (card.state === "found" || (card.remaining ?? quantity) === 0) return "Gone";
    return `${quantity} available`;
  }
  const remaining = card.remaining ?? quantity;
  if (card.state === "found" || remaining === 0) return "Found";
  return `Need ${remaining} more`;
}

/**
 * What the poster will take for it, in one phrase: "Trade or cash",
 * "Trade only", "Cash only". It rides the status line ("is looking for
 * · Trade or cash") instead of a row of chips under it, which said
 * "Looking for" a second time. The app spells it the same
 * (mobile/src/flare-copy.ts).
 */
export function termsLabel(trade: boolean, cash: boolean): string | null {
  if (trade && cash) return "Trade or cash";
  if (trade) return "Trade only";
  if (cash) return "Cash only";
  return null;
}
