import { describe, expect, it } from "vitest";

import { subscriptionFacts } from "@/lib/billing/reconcile";

/**
 * The success page reads the subscription straight from Stripe's
 * expanded Checkout Session and applies it the way the webhook would.
 * The two must produce the same facts from the same object, or a
 * store could be entitled by one and not the other.
 */
describe("subscriptionFacts", () => {
  it("maps Stripe's subscription object to the webhook's facts", () => {
    expect(
      subscriptionFacts({
        id: "sub_1",
        customer: "cus_1",
        status: "trialing",
        cancel_at_period_end: false,
        current_period_end: 1_700_000_000,
        metadata: { tier: "ultra", store_id: "store-1" },
      }),
    ).toEqual({
      stripeSubscriptionId: "sub_1",
      stripeCustomerId: "cus_1",
      tier: "ultra",
      playerId: null,
      storeId: "store-1",
      stripeStatus: "trialing",
      currentPeriodEnd: 1_700_000_000,
      cancelAtPeriodEnd: false,
    });
  });

  it("reads the period from the item when the subscription carries none", () => {
    const facts = subscriptionFacts({
      id: "sub_2",
      status: "active",
      items: { data: [{ current_period_end: 1_800_000_000 }] },
      metadata: { tier: "pro", player_id: "player-1" },
    });
    expect(facts.currentPeriodEnd).toBe(1_800_000_000);
    expect(facts.playerId).toBe("player-1");
    expect(facts.storeId).toBeNull();
  });

  it("treats a missing status as canceled, never as entitled", () => {
    expect(subscriptionFacts({ id: "sub_3" }).stripeStatus).toBe("canceled");
  });
});
