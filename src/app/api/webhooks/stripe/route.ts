import { verifyStripeSignature } from "@/lib/billing/stripe-webhook";
import {
  markStripeSubscriptionCanceled,
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
      await upsertStripeSubscription({
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer ?? null,
        tier: subscription.metadata?.tier ?? "",
        playerId: subscription.metadata?.player_id ?? null,
        storeId: subscription.metadata?.store_id ?? null,
        stripeStatus: subscription.status ?? "canceled",
        currentPeriodEnd: subscription.current_period_end ?? null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
      });
      break;
    }

    case "customer.subscription.deleted":
      await markStripeSubscriptionCanceled(event.data.object.id);
      break;

    default:
      // Delivered, not acted on. Stripe stops retrying; we stay quiet.
      break;
  }

  return Response.json({ received: true });
}
