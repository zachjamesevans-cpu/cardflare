import type { Tier } from "./schema";

/**
 * Which tier each paid feature needs — the one place that answers it.
 *
 * A feature mapped to `null` is free for everyone. Turning it into a
 * paid feature is a one-word edit here, and every gate in the product
 * changes with it, because nothing else is allowed to hold its own
 * opinion about who may do what.
 *
 * Showcases ship free deliberately: a marketplace of cards on offer is
 * worth nothing until there are cards on offer, so the first job is
 * getting people using it. The gate is written and tested now so that
 * making it Pro later is this line, not a refactor.
 */
export const FEATURE_TIERS = {
  /** Posting a card you want to move, rather than one you need. */
  showcase: null as Tier | null,
} as const satisfies Record<string, Tier | null>;

export type Feature = keyof typeof FEATURE_TIERS;

/**
 * Tiers in ascending order of what they include.
 *
 * Pro is a player tier and Ultra/Max are store tiers, so this is not a
 * single ladder of value — it is a ladder of *inclusion*: anything Pro
 * unlocks, the store tiers unlock too, because a shop owner paying for
 * Ultra should never be told a player feature is above their plan.
 */
const RANK: Record<Tier, number> = { pro: 1, ultra: 2, max: 3 };

/**
 * May this owner use this feature?
 *
 * `tier` is what the owner is entitled to right now (null = free), as
 * `tierForPlayer` and `tierForStore` report it.
 */
export function hasFeature(feature: Feature, tier: Tier | null): boolean {
  return meetsTier(FEATURE_TIERS[feature], tier);
}

/**
 * Does `tier` reach `required`?
 *
 * Exported so the gate's behaviour can be tested at every combination
 * while every feature still happens to be free. Testing `hasFeature`
 * alone today would only ever prove that free is free.
 */
export function meetsTier(required: Tier | null, tier: Tier | null): boolean {
  if (required === null) return true;
  if (tier === null) return false;

  return RANK[tier] >= RANK[required];
}

/** True when a feature costs nothing today, whoever is asking. */
export function isFeatureFree(feature: Feature): boolean {
  return FEATURE_TIERS[feature] === null;
}
