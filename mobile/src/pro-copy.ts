/**
 * The Pro screen's and Settings' words about a subscription, with no
 * store or network in them so the unit tests can read them.
 */

/** Apple's own page for every subscription on this Apple ID. */
export const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";

/**
 * The server's 403 "claimed", said the same on the Pro screen and in
 * Settings' Restore. The Apple ID on this phone pays for Pro, but the
 * server has that subscription on a different cardflare account (one
 * Apple subscription unlocks one account). "Nothing found" here was
 * untrue and sent people hunting for a purchase they could see in
 * their Apple settings.
 */
export const CLAIMED_MESSAGE =
  "This Apple ID's Pro subscription belongs to a different cardflare account. Sign in to that account to use it, or subscribe with a different Apple ID.";

export interface SubscriptionFacts {
  source: "stripe" | "apple";
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * "Renews 12 November 2026", or "Ends 12 November 2026" once it is
 * cancelled, or null when there is no date to say: a server older than
 * the field, or a row with no period end yet. Never a guess.
 */
export function renewalLine(
  subscription: SubscriptionFacts | null | undefined,
): string | null {
  if (!subscription?.renewsAt) return null;
  const at = new Date(subscription.renewsAt);
  if (Number.isNaN(at.getTime())) return null;
  const day = at.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return subscription.cancelAtPeriodEnd ? `Ends ${day}` : `Renews ${day}`;
}
