import "server-only";

import { subscriptionForStore } from "@/lib/billing/repository";
import { isEntitled } from "@/lib/billing/schema";
import { stripePriceId } from "@/lib/billing/stripe";

/** Whether Ultra can actually be bought right now: a price exists in Stripe. */
export function ultraIsSellable(): boolean {
  return Boolean(stripePriceId("ultra"));
}

/**
 * A store's plan, in the words the console says it.
 *
 * Read from the money table, never from `stores.tier`: the column is
 * the webhook's echo for the directory badge, and this is the page
 * where the owner needs the date and the reason, not a word.
 */
export type StorePlan =
  | { state: "none" }
  | { state: "trialing"; until: string | null; canManage: boolean }
  | { state: "active"; renews: string | null; canManage: boolean; ending: boolean }
  | { state: "past_due"; until: string | null; canManage: boolean }
  | { state: "ended"; ended: string | null; canManage: boolean }
  | { state: "ending"; until: string | null; canManage: boolean };

export async function storePlan(storeId: string): Promise<StorePlan> {
  const subscription = await subscriptionForStore(storeId);
  if (!subscription) return { state: "none" };

  const canManage = Boolean(subscription.stripe_customer_id);
  const end = subscription.current_period_end;
  const entitled = isEntitled({
    status: subscription.status,
    currentPeriodEnd: end,
  });

  switch (subscription.status) {
    case "trialing":
      return { state: "trialing", until: end, canManage };
    case "active":
      return {
        state: "active",
        renews: end,
        canManage,
        ending: subscription.cancel_at_period_end,
      };
    case "past_due":
      return { state: "past_due", until: end, canManage };
    default:
      return entitled
        ? { state: "ending", until: end, canManage }
        : { state: "ended", ended: end, canManage };
  }
}

/** A date the console can print, or null. */
export function planDate(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(at);
}
