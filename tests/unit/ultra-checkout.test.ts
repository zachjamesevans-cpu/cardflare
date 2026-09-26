import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * One subscription per store.
 *
 * The /ultra button, a double tap or a hand-made POST could send a store
 * that is already on its trial through checkout again, and Stripe would
 * bill both subscriptions. A store with a live subscription goes to its
 * plan card; one that lapsed reuses its Stripe customer and gets no
 * second free trial.
 */

class Redirect extends Error {
  constructor(public readonly to: string) {
    super(to);
  }
}

let subscription: Record<string, unknown> | null = null;
const createCheckoutSession = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));
vi.mock("@/lib/auth/session", () => ({
  getViewer: async () => ({
    kind: "store",
    user: { email: "owner@store.example" },
    storeIds: ["store-1"],
    storeRoles: { "store-1": "owner" },
  }),
}));
vi.mock("@/lib/billing/repository", () => ({
  subscriptionForStore: async () => subscription,
}));
vi.mock("@/lib/billing/stripe", () => ({
  stripePriceId: () => "price_ultra",
  createCheckoutSession: (...a: unknown[]) => createCheckoutSession(...a),
  createBillingPortalSession: vi.fn(),
}));
vi.mock("@/lib/site", () => ({ siteUrl: () => "https://cardflare.gg" }));

const { startUltraCheckoutAction } = await import("@/lib/stores/ultra-actions");

async function start(): Promise<string> {
  const form = new FormData();
  form.set("storeId", "store-1");
  try {
    await startUltraCheckoutAction(form);
  } catch (error) {
    if (error instanceof Redirect) return error.to;
    throw error;
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  subscription = null;
  createCheckoutSession
    .mockReset()
    .mockResolvedValue({
      ok: true,
      data: { id: "cs_1", url: "https://checkout.stripe.com/x" },
    });
});

describe("startUltraCheckoutAction", () => {
  it("starts a first-time store on the fourteen-day trial", async () => {
    await expect(start()).resolves.toBe("https://checkout.stripe.com/x");
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ trialDays: 14, customerId: undefined }),
    );
  });

  it("sends a store already on its trial to its plan, not a second checkout", async () => {
    subscription = {
      status: "trialing",
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
      stripe_customer_id: "cus_1",
    };

    await expect(start()).resolves.toBe("/store/settings?as=store-1");
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("brings a lapsed store back on its own customer, with no second trial", async () => {
    subscription = {
      status: "canceled",
      current_period_end: new Date(Date.now() - 86_400_000).toISOString(),
      stripe_customer_id: "cus_1",
    };

    await start();
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "cus_1", trialDays: undefined }),
    );
  });
});
