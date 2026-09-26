import { subscriptionFacts } from "@/lib/billing/reconcile";
import type { StripeSubscriptionObject } from "@/lib/billing/stripe";
import { verifyStripeSignature } from "@/lib/billing/stripe-webhook";
import { notifyTrialChange, trialChangeFor } from "@/lib/billing/trial-alerts";
import {
  markStripeSubscriptionCanceled,
  syncPlayerTierFromSubscription,
  syncStoreTierFromSubscription,
  upsertStripeSubscription,
} from "@/lib/billing/repository";

export const dynamic = "force-dynamic";

/**
 * Where Stripe reports what happened to a subscription.
 *
 * This route is the single writer for Stripe-sourced rows: checkout
 * completes, renewals land, cards fail, cancellations arrive — each as
 * a signed event, applied idempotently. The signature check fails
 * closed (no STRIPE_WEBHOOK_SECRET configured means every request is
 * refused) and unrecognised event types are acknowledged and ignored,
 * which is what Stripe's docs ask for: a 200 means "delivered", not
 * "acted on".
 *
 * checkout.session.completed is deliberately NOT the activation write.
 * Stripe always sends customer.subscription.created alongside it, that
 * event carries the full subscription (status, period end, metadata),
 * and handling only the subscription lifecycle keeps this route to one
 * shape of truth.
 */

type StripeEvent = {
  type: string;
  data: {
    object: {
      id: string;
      customer?: string | null;
      status?: string;
      cancel_at_period_end?: boolean;
      current_period_end?: number | null;
      metadata?: Record<string, string>;
    };
    /** Stripe sends the old values of whatever changed, on an update. */
    previous_attributes?: { status?: string };
  };
};

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Not configured", { status: 401 });

  const payload = await request.text();

  if (
    !verifyStripeSignature(payload, request.headers.get("stripe-signature"), secret)
  ) {
    return new Response("Bad signature", { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object;
      /* The same reading the success page uses: newer Stripe API
         versions carry the period end on the item, not the
         subscription, and reading only the top level wrote null over
         the trial's end date on every event. */
      const outcome = await upsertStripeSubscription(
        subscriptionFacts(subscription as StripeSubscriptionObject),
      );
      /* A write that did not happen must not be acknowledged: a 500 is
         what makes Stripe retry, and its retries are the only safety
         net between a card being charged and the store seeing it. */
      if (outcome === "unavailable") {
        return new Response("Could not record the subscription", { status: 500 });
      }
      /* The gates read players.tier, so the money table's change is
         pushed there — same as the Apple paths. */
      if (subscription.metadata?.player_id) {
        await syncPlayerTierFromSubscription(subscription.metadata.player_id);
      }
      if (subscription.metadata?.store_id) {
        await syncStoreTierFromSubscription(subscription.metadata.store_id);
        /* The founder hears about a trial starting, paying, or lapsing.
           After the tier sync so the admin link lands on the truth. */
        const change = trialChangeFor(
          event.type,
          subscription.status,
          event.data.previous_attributes?.status,
        );
        if (change) await notifyTrialChange(change, subscription.metadata.store_id);
      }
      break;
    }

    case "customer.subscription.deleted": {
      if (
        (await markStripeSubscriptionCanceled(event.data.object.id)) === "unavailable"
      ) {
        return new Response("Could not record the cancellation", { status: 500 });
      }
      const playerId = event.data.object.metadata?.player_id ?? null;
      if (playerId) await syncPlayerTierFromSubscription(playerId);
      const storeId = event.data.object.metadata?.store_id ?? null;
      if (storeId) {
        await syncStoreTierFromSubscription(storeId);
        const change = trialChangeFor(event.type, event.data.object.status, undefined);
        if (change) await notifyTrialChange(change, storeId);
      }
      break;
    }

    default:
      // Delivered, not acted on. Stripe stops retrying; we stay quiet.
      break;
  }

  return Response.json({ received: true });
}
