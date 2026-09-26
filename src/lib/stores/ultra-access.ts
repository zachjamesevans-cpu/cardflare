import "server-only";

import { hasFeature, type Feature } from "@/lib/billing/features";
import { isTier, type Tier } from "@/lib/billing/schema";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { ultraIsSellable } from "./ultra";

/**
 * Whether a store may use one of Ultra's features right now.
 *
 * Read from `stores.tier`, which the Stripe webhook and the success
 * page keep in step with the subscription, and which the admin's
 * "Upgrade to Ultra" sets directly for a store the founder comps. One
 * column, so a comped store and a paying one pass the same way.
 *
 * Open to everyone while billing is not switched on: the plan card
 * promises "your store works in full meanwhile", and a lock with no
 * way to pay would strand every store.
 */
export function storeTierAsFeatureTier(tier: string | null | undefined): Tier | null {
  return tier && isTier(tier) ? tier : null;
}

export function tierHasFeature(
  feature: Feature,
  tier: string | null | undefined,
): boolean {
  if (!ultraIsSellable()) return true;
  return hasFeature(feature, storeTierAsFeatureTier(tier));
}

export async function storeHasFeature(
  storeId: string,
  feature: Feature,
): Promise<boolean> {
  if (!ultraIsSellable()) return true;
  if (!isSupabaseConfigured()) return false;

  const { data, error } = await getSupabaseAdmin()
    .from("stores")
    .select("tier")
    .eq("id", storeId)
    .maybeSingle();

  if (error) {
    /* Open rather than shut on a failed read: a shop's TV going dark on
       a Friday night because one query hiccuped is the worse failure. */
    console.error("Could not read the store's plan", error.message);
    return true;
  }

  return tierHasFeature(feature, data?.tier);
}
