import "server-only";

import { subscriptionForPlayer } from "./repository";
import { isEntitled } from "./schema";
import { stripePriceId } from "./stripe";

export const PRO_PRICE_LABEL = "$7.99";

/** Whether Pro can be bought on the website: a Stripe price exists. */
export function proIsSellableOnWeb(): boolean {
  return Boolean(stripePriceId("pro"));
}

/**
 * Where a player stands with Pro, for the page to say in a sentence.
 *
 * Read from the money table, not from players.tier: the column is the
 * gate's echo, and an admin can set it by hand. Here the question is
 * what the person is paying and through whom, because the answer
 * decides which button they see.
 */
export type ProPlan =
  | { state: "none" }
  | {
      state: "on";
      source: "apple" | "stripe";
      renews: string | null;
      canManage: boolean;
    }
  | {
      state: "ending";
      source: "apple" | "stripe";
      until: string | null;
      canManage: boolean;
    };

export async function proPlanForPlayer(playerId: string): Promise<ProPlan> {
  const subscription = await subscriptionForPlayer(playerId);
  if (!subscription || subscription.tier !== "pro") return { state: "none" };

  const entitled = isEntitled({
    status: subscription.status,
    currentPeriodEnd: subscription.current_period_end,
  });
  if (!entitled) return { state: "none" };

  const canManage =
    subscription.source === "stripe" && Boolean(subscription.stripe_customer_id);
  const ending =
    subscription.cancel_at_period_end || subscription.status === "canceled";

  return ending
    ? {
        state: "ending",
        source: subscription.source,
        until: subscription.current_period_end,
        canManage,
      }
    : {
        state: "on",
        source: subscription.source,
        renews: subscription.current_period_end,
        canManage,
      };
}
