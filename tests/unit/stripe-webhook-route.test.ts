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
const syncPlayerTierFromSubscription = vi.fn();
const syncStoreTierFromSubscription = vi.fn();

vi.mock("@/lib/billing/repository", () => ({
  upsertStripeSubscription: (...a: unknown[]) => upsertStripeSubscription(...a),
  markStripeSubscriptionCanceled: (...a: unknown[]) =>
    markStripeSubscriptionCanceled(...a),
  syncPlayerTierFromSubscription: (...a: unknown[]) =>
    syncPlayerTierFromSubscription(...a),
  syncStoreTierFromSubscription: (...a: unknown[]) =>
    syncStoreTierFromSubscription(...a),
}));

const notifyTrialChange = vi.fn();
vi.mock("@/lib/billing/trial-alerts", async () => {
  const real = await vi.importActual<typeof import("@/lib/billing/trial-alerts")>(
    "@/lib/billing/trial-alerts",
  );
  return { ...real, notifyTrialChange: (...a: unknown[]) => notifyTrialChange(...a) };
});

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
  notifyTrialChange.mockReset();
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

  /* A 200 tells Stripe to stop. Acknowledging a write that failed threw
     away the retries, the only safety net between a charge and the
     store seeing it. */
  it("asks Stripe to retry when the subscription could not be recorded", async () => {
    upsertStripeSubscription.mockResolvedValue("unavailable");
    const body = JSON.stringify({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          status: "active",
          metadata: { tier: "ultra", store_id: "s1" },
        },
      },
    });

    const response = await route.POST(signedRequest(body));

    expect(response.status).toBe(500);
  });

  it("asks Stripe to retry when a cancellation could not be recorded", async () => {
    markStripeSubscriptionCanceled.mockResolvedValue("unavailable");
    const body = JSON.stringify({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_1", status: "canceled", metadata: {} } },
    });

    expect((await route.POST(signedRequest(body))).status).toBe(500);
  });

  /* Newer Stripe API versions moved the period end onto the item. */
  it("reads the trial's end from the item on newer API versions", async () => {
    upsertStripeSubscription.mockResolvedValue("written");
    const body = JSON.stringify({
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_1",
          status: "trialing",
          items: { data: [{ current_period_end: 1_800_000_000 }] },
          metadata: { tier: "ultra", store_id: "s1" },
        },
      },
    });

    await route.POST(signedRequest(body));

    expect(upsertStripeSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ currentPeriodEnd: 1_800_000_000 }),
    );
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
    /* The console and the directory badge read stores.tier, so the
       event pushes the money table's change there. */
    expect(syncStoreTierFromSubscription).toHaveBeenCalledWith("store-1");
    expect(syncPlayerTierFromSubscription).not.toHaveBeenCalled();
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

describe("trial alerts", () => {
  it("tells the founder when a store's trial starts, converts, or ends", async () => {
    const send = async (body: object) =>
      route.POST(signedRequest(JSON.stringify(body)));

    await send({
      type: "customer.subscription.created",
      data: {
        object: { id: "sub_1", status: "trialing", metadata: { store_id: "st_1" } },
      },
    });
    expect(notifyTrialChange).toHaveBeenLastCalledWith("started", "st_1");

    await send({
      type: "customer.subscription.updated",
      data: {
        object: { id: "sub_1", status: "active", metadata: { store_id: "st_1" } },
        previous_attributes: { status: "trialing" },
      },
    });
    expect(notifyTrialChange).toHaveBeenLastCalledWith("converted", "st_1");

    await send({
      type: "customer.subscription.deleted",
      data: {
        object: { id: "sub_1", status: "trialing", metadata: { store_id: "st_1" } },
      },
    });
    expect(notifyTrialChange).toHaveBeenLastCalledWith("ended", "st_1");
  });

  it("stays quiet for a player's subscription and for changes that are not trial moments", async () => {
    await route.POST(
      signedRequest(
        JSON.stringify({
          type: "customer.subscription.updated",
          data: {
            object: { id: "sub_2", status: "active", metadata: { store_id: "st_2" } },
            previous_attributes: { cancel_at_period_end: false },
          },
        }),
      ),
    );
    await route.POST(
      signedRequest(
        JSON.stringify({
          type: "customer.subscription.created",
          data: {
            object: {
              id: "sub_3",
              status: "trialing",
              metadata: { player_id: "pl_1" },
            },
          },
        }),
      ),
    );
    expect(notifyTrialChange).not.toHaveBeenCalled();
  });
});
