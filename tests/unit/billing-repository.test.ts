import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The money table's guards. The upsert must refuse to invent an
 * entitlement from an event this product did not shape (bad tier, no
 * owner, two owners), and the tier readers must apply the entitlement
 * rules rather than parroting whatever status the row holds.
 */

type Response = Record<string, unknown>;

const queues: Record<string, Response[]> = {};
const calls: Record<string, unknown[][]> = {};

function chain(response: Response) {
  const c: Record<string, unknown> = {};
  for (const method of ["select", "eq", "update", "upsert"]) {
    c[method] = vi.fn((...args: unknown[]) => {
      (calls[method] ??= []).push(args);
      return c;
    });
  }
  c.maybeSingle = () => Promise.resolve(response);
  c.then = (resolve: (v: Response) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(response).then(resolve, reject);
  return c;
}

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: (table: string) =>
      chain(queues[table]?.shift() ?? { data: null, error: null }),
  }),
}));

const { tierForPlayer, upsertStripeSubscription } =
  await import("@/lib/billing/repository");

const FACTS = {
  stripeSubscriptionId: "sub_1",
  stripeCustomerId: "cus_1",
  tier: "pro",
  playerId: "player-1",
  storeId: null,
  stripeStatus: "active",
  currentPeriodEnd: 1_700_000_000,
  cancelAtPeriodEnd: false,
};

beforeEach(() => {
  for (const key of Object.keys(queues)) delete queues[key];
  for (const key of Object.keys(calls)) delete calls[key];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("upsertStripeSubscription", () => {
  it("writes a well-shaped event, keyed on the Stripe subscription id", async () => {
    queues.subscriptions = [{ error: null }];

    await expect(upsertStripeSubscription(FACTS)).resolves.toBe("written");

    const [values, options] = calls.upsert![0] as [Record<string, unknown>, unknown];
    expect(values).toMatchObject({
      tier: "pro",
      player_id: "player-1",
      store_id: null,
      source: "stripe",
      status: "active",
      stripe_subscription_id: "sub_1",
      current_period_end: new Date(1_700_000_000 * 1000).toISOString(),
    });
    expect(options).toEqual({ onConflict: "stripe_subscription_id" });
  });

  it("ignores an event with a tier this product does not sell", async () => {
    await expect(
      upsertStripeSubscription({ ...FACTS, tier: "platinum" }),
    ).resolves.toBe("ignored");

    expect(calls.upsert).toBeUndefined();
  });

  it("ignores an event with no owner, and one claiming two owners", async () => {
    await expect(upsertStripeSubscription({ ...FACTS, playerId: null })).resolves.toBe(
      "ignored",
    );
    await expect(
      upsertStripeSubscription({ ...FACTS, storeId: "store-1" }),
    ).resolves.toBe("ignored");

    expect(calls.upsert).toBeUndefined();
  });

  it("folds Stripe's status on the way in", async () => {
    queues.subscriptions = [{ error: null }];

    await upsertStripeSubscription({ ...FACTS, stripeStatus: "unpaid" });

    const [values] = calls.upsert![0] as [Record<string, unknown>];
    expect(values.status).toBe("canceled");
  });
});

describe("tierForPlayer", () => {
  it("answers with the tier while the subscription entitles", async () => {
    queues.subscriptions = [
      {
        data: { tier: "pro", status: "active", current_period_end: null },
        error: null,
      },
    ];

    await expect(tierForPlayer("player-1")).resolves.toBe("pro");
  });

  it("answers free once a canceled subscription's paid period is over", async () => {
    queues.subscriptions = [
      {
        data: {
          tier: "pro",
          status: "canceled",
          current_period_end: new Date(Date.now() - 1000).toISOString(),
        },
        error: null,
      },
    ];

    await expect(tierForPlayer("player-1")).resolves.toBeNull();
  });

  it("answers free for a player with no subscription at all", async () => {
    await expect(tierForPlayer("player-1")).resolves.toBeNull();
  });
});
