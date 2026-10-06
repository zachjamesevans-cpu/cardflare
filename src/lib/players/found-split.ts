/**
 * How a hunt request's found copies spread over the Flares posted for it.
 *
 * A request can be posted more than once: two copies on one night's
 * board and two on another's. Its count of copies in hand is one
 * number, and copying that number onto every Flare (each capped at its
 * own quantity) told the Feed that four found copies were eight. So the
 * number is shared out instead: the copies a trade brought belong to
 * the Flare that traded and are counted first, and what is left fills
 * the open Flares one at a time, oldest first.
 *
 * Free of server imports so a unit test can hold it to the arithmetic.
 */

export interface LinkedFlare {
  id: string;
  quantity: number;
  status: string;
  created_at: string;
}

/** The found count each OPEN linked Flare should show, by id. */
export function splitFound(found: number, flares: LinkedFlare[]): Map<string, number> {
  const ordered = [...flares].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const traded = ordered
    .filter((flare) => flare.status === "traded")
    .reduce((sum, flare) => sum + flare.quantity, 0);

  let left = Math.max(0, Math.round(found) - traded);
  const split = new Map<string, number>();
  for (const flare of ordered) {
    if (flare.status !== "open") continue;
    const share = Math.min(flare.quantity, left);
    split.set(flare.id, share);
    left -= share;
  }
  return split;
}
