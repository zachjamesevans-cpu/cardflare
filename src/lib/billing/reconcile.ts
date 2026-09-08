import "server-only";

import {
  syncPlayerTierFromSubscription,
  syncStoreTierFromSubscription,
  upsertStripeSubscription,
  type StripeSubscriptionFacts,
} from "./repository";
import { retrieveCheckoutSession, type StripeSubscriptionObject } from "./stripe";

/**
 * The success page's own read of what just happened.
 *
 * Stripe redirects the browser back before it delivers the webhook,
 * sometimes by several seconds, so the first page a store owner sees
 * after paying was built before the site knew. Rather than guess, the
 * success page asks Stripe for the session it was sent back from and
 * applies the subscription the same way the webhook would; whichever
 * of the two arrives second is an idempotent no-op. The owner in the
 * session's metadata must be the one asking, so a session id pasted
 * into somebody else's URL entitles nobody.
 */
export function subscriptionFacts(
  subscription: StripeSubscriptionObject,
): StripeSubscriptionFacts {
  return {
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: subscription.customer ?? null,
    tier: subscription.metadata?.tier ?? "",
    playerId: subscription.metadata?.player_id ?? null,
    storeId: subscription.metadata?.store_id ?? null,
    stripeStatus: subscription.status ?? "canceled",
    /* Newer API versions carry the period on the item, older ones on
       the subscription; the webhook reads the top-level one, so both
       are honoured here. */
    currentPeriodEnd:
      subscription.current_period_end ??
      subscription.items?.data?.[0]?.current_period_end ??
      null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
  };
}

export async function reconcileCheckoutSession(
  sessionId: string,
  owner: { storeId?: string; playerId?: string },
): Promise<boolean> {
  const session = await retrieveCheckoutSession(sessionId);
  if (!session.ok) return false;

  const metadata = session.data.metadata ?? {};
  const mine =
    (owner.storeId && metadata.store_id === owner.storeId) ||
    (owner.playerId && metadata.player_id === owner.playerId);
  if (!mine) return false;

  const subscription = session.data.subscription;
  if (!subscription || typeof subscription === "string") return false;

  const outcome = await upsertStripeSubscription(subscriptionFacts(subscription));
  if (outcome !== "written") return false;

  if (owner.storeId) await syncStoreTierFromSubscription(owner.storeId);
  if (owner.playerId) await syncPlayerTierFromSubscription(owner.playerId);
  return true;
}
