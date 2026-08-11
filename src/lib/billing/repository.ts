import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { SubscriptionRow } from "@/lib/supabase/types";
import { foldStripeStatus, isEntitled, isTier, type Tier } from "./schema";

/**
 * Reading and writing the money table.
 *
 * Two families of caller. Feature gates read: `tierForPlayer` and
 * `tierForStore` answer "what has this owner paid for right now?" with
 * a tier or null, entitlement rules included, so gating a feature is
 * one call and one comparison. The Stripe webhook writes: lifecycle
 * events land as upserts keyed on the Stripe subscription id, which
 * makes Stripe's retries idempotent for free.
 *
 * Nothing here knows a price, and nothing here is called by any UI
 * yet — this is the API the tier features will stand on.
 */

export async function subscriptionForPlayer(
  playerId: string,
): Promise<SubscriptionRow | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("subscriptions")
    .select("*")
    .eq("player_id", playerId)
    .maybeSingle();

  if (error) console.error("Could not read the player's subscription", error);
  return data ?? null;
}

export async function subscriptionForStore(
  storeId: string,
): Promise<SubscriptionRow | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("subscriptions")
    .select("*")
    .eq("store_id", storeId)
    .maybeSingle();

  if (error) console.error("Could not read the store's subscription", error);
  return data ?? null;
}

/** The tier a player is entitled to right now, or null for free. */
export async function tierForPlayer(playerId: string): Promise<Tier | null> {
  const subscription = await subscriptionForPlayer(playerId);
  return entitledTier(subscription);
}

/** The tier a store (shop or vendor) is entitled to right now, or null. */
export async function tierForStore(storeId: string): Promise<Tier | null> {
  const subscription = await subscriptionForStore(storeId);
  return entitledTier(subscription);
}

function entitledTier(subscription: SubscriptionRow | null): Tier | null {
  if (!subscription) return null;

  const entitled = isEntitled({
    status: subscription.status,
    currentPeriodEnd: subscription.current_period_end,
  });

  return entitled ? subscription.tier : null;
}

/**
 * What a Stripe lifecycle event tells us about one subscription.
 *
 * The owner and tier come from the metadata the checkout session
 * planted on the subscription; the rest is Stripe's current view.
 */
export interface StripeSubscriptionFacts {
  stripeSubscriptionId: string;
  stripeCustomerId: string | null;
  tier: string;
  playerId: string | null;
  storeId: string | null;
  /** Stripe's own status word, folded to ours on write. */
  stripeStatus: string;
  /** Unix seconds, as Stripe sends it. Null when absent. */
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}

export type UpsertOutcome = "written" | "ignored" | "unavailable";

/**
 * Applies one Stripe lifecycle event to the table.
 *
 * Keyed on the Stripe subscription id, so created, updated and the
 * retries of either all land as the same idempotent write. An event
 * whose metadata names no valid owner-and-tier pair is ignored rather
 * than guessed at: a subscription this product did not create (or a
 * hand-edited one) must never grant an entitlement here.
 */
export async function upsertStripeSubscription(
  facts: StripeSubscriptionFacts,
): Promise<UpsertOutcome> {
  if (!isSupabaseConfigured()) return "unavailable";

  const ownerCount = Number(Boolean(facts.playerId)) + Number(Boolean(facts.storeId));
  if (!isTier(facts.tier) || ownerCount !== 1) return "ignored";

  const { error } = await getSupabaseAdmin()
    .from("subscriptions")
    .upsert(
      {
        tier: facts.tier,
        player_id: facts.playerId,
        store_id: facts.storeId,
        source: "stripe",
        status: foldStripeStatus(facts.stripeStatus),
        stripe_customer_id: facts.stripeCustomerId,
        stripe_subscription_id: facts.stripeSubscriptionId,
        current_period_end: facts.currentPeriodEnd
          ? new Date(facts.currentPeriodEnd * 1000).toISOString()
          : null,
        cancel_at_period_end: facts.cancelAtPeriodEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_subscription_id" },
    );

  if (error) {
    console.error("Could not write the subscription", error);
    return "unavailable";
  }

  return "written";
}

/** Marks a Stripe subscription ended; the entitlement tail still honours
    whatever period was already paid. */
export async function markStripeSubscriptionCanceled(
  stripeSubscriptionId: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const { error } = await getSupabaseAdmin()
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", stripeSubscriptionId);

  if (error) console.error("Could not mark the subscription canceled", error);
}
