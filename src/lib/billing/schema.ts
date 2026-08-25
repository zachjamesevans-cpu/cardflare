/**
 * The tiers, and what being paid means — pure, importable anywhere.
 *
 * Three tiers, two owner shapes: cardflare Pro belongs to a player;
 * cardflare Ultra and cardflare Max belong to a store row, because a
 * vendor IS a store with kind "vendor" (Milestone 9's one-switch
 * design). Every feature gate in the product asks this module, never a
 * payment provider: whichever of Stripe or Apple sold the subscription,
 * entitlement is a question about the row, not about the receipt.
 *
 * There are deliberately no prices here. Prices live in Stripe price
 * objects and App Store products, referenced by id from server
 * environment variables, so a price change is a dashboard edit and a
 * redeploy of nothing.
 */

export const TIERS = ["pro", "ultra", "max"] as const;
export type Tier = (typeof TIERS)[number];

export function isTier(value: string): value is Tier {
  return (TIERS as readonly string[]).includes(value);
}

/** The names as marketing says them, the only place they are spelled. */
export const TIER_LABELS: Record<Tier, string> = {
  pro: "cardflare Pro",
  ultra: "cardflare Ultra",
  max: "cardflare Max",
};

/** Who a tier can belong to. */
export const TIER_AUDIENCE: Record<Tier, "player" | "store"> = {
  pro: "player",
  ultra: "store",
  max: "store",
};

/** The tier a store's kind is sold: shops get Ultra, vendors get Max. */
export function tierForStoreKind(kind: "lgs" | "vendor"): Tier {
  return kind === "vendor" ? "max" : "ultra";
}

export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled";

/**
 * Whether a subscription currently entitles its owner.
 *
 * Active and trialing simply do. Past-due keeps its features until the
 * paid-through moment — a failed card retry must not yank a store's
 * tools mid-event — and canceled does the same, because cancellation
 * takes effect at the period end the owner already paid for. A row with
 * no period end and a bad status entitles nothing.
 */
export function isEntitled(
  subscription: {
    status: SubscriptionStatus;
    currentPeriodEnd: string | null;
  },
  now: number = Date.now(),
): boolean {
  if (subscription.status === "active" || subscription.status === "trialing") {
    return true;
  }

  return (
    subscription.currentPeriodEnd !== null &&
    now < new Date(subscription.currentPeriodEnd).getTime()
  );
}

/**
 * Stripe's subscription statuses, folded to ours.
 *
 * Stripe distinguishes eight states; the product distinguishes four.
 * Everything that means "not going to be paid" (unpaid, incomplete,
 * incomplete_expired, paused) folds to canceled, and the entitlement
 * tail on canceled still honours whatever period was already paid.
 */
export function foldStripeStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    default:
      return "canceled";
  }
}
