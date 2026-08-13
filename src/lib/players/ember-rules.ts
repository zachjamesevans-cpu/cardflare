/**
 * What a trade is worth, in Embers.
 *
 * Pure and free of server-only imports so the numbers can be reasoned
 * about and tested on their own. Everything that touches the database
 * lives in `embers.ts`; this file only answers "how much".
 *
 * The founder's rule, unchanged: only a CONFIRMED trade earns anything.
 * Posting a Flare earns nothing, pledging earns nothing, turning up
 * earns nothing. The one act the whole product exists to cause is the
 * only one that pays.
 */

/**
 * A trade with somebody you have not traded with before.
 *
 * The big one, because meeting a new person is the thing CardFlare is
 * actually for. Ten is chosen against the catalogue rather than in the
 * abstract: the cheapest paid cosmetic is 150, so a new player has
 * something to aim at after a handful of nights rather than after one.
 */
export const EMBERS_NEW_PARTNER = 10;

/**
 * A trade with somebody you have already traded with.
 *
 * WORTH SAYING PLAINLY: this taper is a proposal, not something the
 * founder asked for. Without it two friends can sit at a table and tap
 * confirm at each other until the badge means nothing, and the badge is
 * the entire point of `embers_earned`. Two rather than zero because
 * regulars trading with regulars is a real night at a store, not an
 * exploit, and it should still count for something.
 *
 * Set this to EMBERS_NEW_PARTNER to turn the taper off.
 */
export const EMBERS_REPEAT_PARTNER = 2;

/**
 * A trade recorded with no partner named.
 *
 * The board allows this: you traded with someone who never tapped
 * "offer", and it is still a tally mark. It pays less than a named trade
 * because nothing corroborates it — there is no second person whose
 * account also moved, so it is the one shape a player can write alone.
 */
export const EMBERS_UNNAMED_PARTNER = 3;

/**
 * How much a confirmed trade pays one side of it.
 *
 * `partnerKnown` is false when nobody was named on the confirm. In that
 * case there is only one side to pay and no history to consult.
 */
export function embersForTrade({
  partnerKnown,
  tradedBefore,
}: {
  partnerKnown: boolean;
  tradedBefore: boolean;
}): number {
  if (!partnerKnown) return EMBERS_UNNAMED_PARTNER;
  return tradedBefore ? EMBERS_REPEAT_PARTNER : EMBERS_NEW_PARTNER;
}

/**
 * The idempotency key for a trade's award.
 *
 * Keyed to the trade and the player rather than the trade alone, because
 * a confirmed trade pays BOTH sides and each side needs its own ledger
 * row. Keyed at all because confirming is retry-safe by design: the
 * second attempt must cost nothing.
 */
export function tradeAwardRef(tradeId: string, playerId: string): string {
  return `trade:${tradeId}:${playerId}`;
}

/** The idempotency key for buying one cosmetic once. */
export function purchaseRef(playerId: string, slug: string): string {
  return `purchase:${playerId}:${slug}`;
}

/**
 * The badge's tiers.
 *
 * A raw lifetime number is hard to read across a table: 40 and 400 look
 * the same at a glance in a roster row. A name does not. These are
 * deliberately reachable — the first is one good night — because a
 * status ladder whose bottom rung takes a month is a ladder nobody
 * starts climbing.
 */
export const EMBER_TIERS = [
  { at: 0, name: "Spark" },
  { at: 50, name: "Kindling" },
  { at: 200, name: "Blaze" },
  { at: 600, name: "Wildfire" },
  { at: 1500, name: "Inferno" },
] as const;

export type EmberTier = (typeof EMBER_TIERS)[number]["name"];

/** The tier a lifetime total sits in. */
export function emberTier(earned: number): EmberTier {
  let tier: EmberTier = EMBER_TIERS[0].name;
  for (const step of EMBER_TIERS) {
    if (earned >= step.at) tier = step.name;
  }
  return tier;
}

/** How many more Embers to the next tier, or null at the top. */
export function toNextTier(earned: number): { name: EmberTier; needed: number } | null {
  const next = EMBER_TIERS.find((step) => earned < step.at);
  return next ? { name: next.name, needed: next.at - earned } : null;
}
