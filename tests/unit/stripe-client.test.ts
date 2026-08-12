import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createBillingPortalSession,
  createCheckoutSession,
  isStripeConfigured,
  sellableTiers,
  stripePriceId,
} from "@/lib/billing/stripe";

/**
 * The Stripe client's honesty: with no key there is no Stripe (reported
 * as such, never a request on the wire), prices come only from the
 * environment, and a checkout session plants the owner in metadata
 * twice — once for the checkout event, once on the subscription so
 * every later lifecycle event still knows whose row it is.
 */

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_1");
  vi.stubEnv("STRIPE_PRICE_PRO", "price_pro_1");
  vi.stubEnv("STRIPE_PRICE_ULTRA", "price_ultra_1");
  vi.stubEnv("STRIPE_PRICE_MAX", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("configuration", () => {
  it("is only configured when the secret key exists", () => {
    expect(isStripeConfigured()).toBe(true);
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(isStripeConfigured()).toBe(false);
  });

  it("sells exactly the tiers whose prices are configured", () => {
    expect(sellableTiers()).toEqual(["pro", "ultra"]);
    expect(stripePriceId("max")).toBeNull();
  });

  it("sells nothing at all without the secret key", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(sellableTiers()).toEqual([]);
  });
});

describe("createCheckoutSession", () => {
  it("posts the form Stripe expects, owner in metadata twice", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ id: "cs_1", url: "https://checkout.stripe.com/x" }),
      ),
    );

    const result = await createCheckoutSession({
      tier: "pro",
      playerId: "player-1",
      successUrl: "https://cardflare.gg/account?upgraded=1",
      cancelUrl: "https://cardflare.gg/account",
    });

    expect(result).toEqual({
      ok: true,
      data: { id: "cs_1", url: "https://checkout.stripe.com/x" },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer sk_test_1",
    );

    const body = new URLSearchParams(String(init.body));
    expect(body.get("mode")).toBe("subscription");
    expect(body.get("line_items[0][price]")).toBe("price_pro_1");
    expect(body.get("metadata[tier]")).toBe("pro");
    expect(body.get("metadata[player_id]")).toBe("player-1");
    expect(body.get("subscription_data[metadata][player_id]")).toBe("player-1");
  });

  it("answers not-configured for a tier with no price, without calling out", async () => {
    const result = await createCheckoutSession({
      tier: "max",
      storeId: "store-1",
      successUrl: "https://x",
      cancelUrl: "https://x",
    });

    expect(result).toEqual({ ok: false, reason: "not-configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a Stripe refusal instead of pretending", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "No such price" } }), {
        status: 400,
      }),
    );

    const result = await createCheckoutSession({
      tier: "pro",
      playerId: "player-1",
      successUrl: "https://x",
      cancelUrl: "https://x",
    });

    expect(result).toEqual({ ok: false, reason: "stripe-error" });
  });
});

describe("createBillingPortalSession", () => {
  it("asks for the portal with the customer and the way back", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ url: "https://billing.stripe.com/p" })),
    );

    const result = await createBillingPortalSession(
      "cus_1",
      "https://cardflare.gg/account",
    );

    expect(result).toEqual({ ok: true, data: { url: "https://billing.stripe.com/p" } });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(String(init.body));
    expect(body.get("customer")).toBe("cus_1");
    expect(body.get("return_url")).toBe("https://cardflare.gg/account");
  });
});
