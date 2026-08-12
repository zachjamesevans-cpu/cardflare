import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The webhook route's discipline: fail closed without a secret, refuse
 * a bad signature before reading the payload's claims, apply
 * subscription lifecycle events through the repository, and answer 200
 * to event types it does not handle so Stripe stops retrying them.
 */

const upsertStripeSubscription = vi.fn();
const markStripeSubscriptionCanceled = vi.fn();

vi.mock("@/lib/billing/repository", () => ({
  upsertStripeSubscription: (...a: unknown[]) => upsertStripeSubscription(...a),
  markStripeSubscriptionCanceled: (...a: unknown[]) =>
    markStripeSubscriptionCanceled(...a),
}));

const route = await import("@/app/api/webhooks/stripe/route");

const SECRET = "whsec_route_test";

function signedRequest(body: string, secret = SECRET): Request {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  return new Request("https://cardflare.gg/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
    body,
  });
}

beforeEach(() => {
  upsertStripeSubscription.mockReset();
  markStripeSubscriptionCanceled.mockReset();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/stripe", () => {
  it("fails closed when no webhook secret is configured", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");

    const response = await route.POST(signedRequest("{}"));

    expect(response.status).toBe(401);
    expect(upsertStripeSubscription).not.toHaveBeenCalled();
  });

  it("refuses a signature made with the wrong secret", async () => {
    const response = await route.POST(signedRequest("{}", "whsec_wrong"));

    expect(response.status).toBe(400);
    expect(upsertStripeSubscription).not.toHaveBeenCalled();
  });

  it("applies a subscription lifecycle event through the repository", async () => {
    const body = JSON.stringify({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          status: "active",
          cancel_at_period_end: false,
          current_period_end: 1_700_000_000,
          metadata: { tier: "ultra", store_id: "store-1" },
        },
      },
    });

    const response = await route.POST(signedRequest(body));

    expect(response.status).toBe(200);
    expect(upsertStripeSubscription).toHaveBeenCalledWith({
      stripeSubscriptionId: "sub_1",
      stripeCustomerId: "cus_1",
      tier: "ultra",
      playerId: null,
      storeId: "store-1",
      stripeStatus: "active",
      currentPeriodEnd: 1_700_000_000,
      cancelAtPeriodEnd: false,
    });
  });

  it("marks a deleted subscription canceled", async () => {
    const body = JSON.stringify({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_1" } },
    });

    await route.POST(signedRequest(body));

    expect(markStripeSubscriptionCanceled).toHaveBeenCalledWith("sub_1");
  });

  it("acknowledges event types it does not handle, touching nothing", async () => {
    const body = JSON.stringify({
      type: "invoice.paid",
      data: { object: { id: "in_1" } },
    });

    const response = await route.POST(signedRequest(body));

    expect(response.status).toBe(200);
    expect(upsertStripeSubscription).not.toHaveBeenCalled();
    expect(markStripeSubscriptionCanceled).not.toHaveBeenCalled();
  });

  it("refuses a signed but unparseable payload", async () => {
    const response = await route.POST(signedRequest("not json"));

    expect(response.status).toBe(400);
  });
});
