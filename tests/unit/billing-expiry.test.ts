import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * When Pro ends. A cancellation takes effect at the end of the paid
 * period and nothing tells us when that is, so a daily sweep re-asks
 * the tier sync; Stripe's "deleted" means over NOW; Apple's webhook
 * must let Apple retry when our side failed; and a free sandbox
 * purchase is not production Pro.
 */

type Response = Record<string, unknown>;
const queues: Record<string, Response[]> = {};
const updates: unknown[] = [];

function chain(response: Response) {
  const c: Record<string, unknown> = {};
  for (const method of ["select", "eq", "lt", "order", "limit"]) {
    c[method] = vi.fn(() => c);
  }
  c.update = vi.fn((patch: unknown) => {
    updates.push(patch);
    return c;
  });
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

const syncPlayer = vi.fn(async (id: string) => void id);
const syncStore = vi.fn(async (id: string) => void id);
vi.mock("@/lib/billing/repository", async () => {
  const real = await vi.importActual<typeof import("@/lib/billing/repository")>(
    "@/lib/billing/repository",
  );
  return {
    ...real,
    syncPlayerTierFromSubscription: (id: string) => syncPlayer(id),
    syncStoreTierFromSubscription: (id: string) => syncStore(id),
  };
});

const cron = await import("@/app/api/cron/subscriptions/route");
const { markStripeSubscriptionCanceled } = await import("@/lib/billing/repository");
const { sandboxMayEntitle } = await import("@/lib/billing/apple");

function cronRequest(token?: string): Request {
  return new Request("https://cardflare.gg/api/cron/subscriptions", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  for (const key of Object.keys(queues)) delete queues[key];
  updates.length = 0;
  syncPlayer.mockClear();
  syncStore.mockClear();
  vi.stubEnv("CRON_SECRET", "cron-secret-1");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/cron/subscriptions", () => {
  it("fails closed without the secret", async () => {
    expect((await cron.GET(cronRequest())).status).toBe(401);
    expect((await cron.GET(cronRequest("wrong"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await cron.GET(cronRequest(""))).status).toBe(401);
    expect(syncPlayer).not.toHaveBeenCalled();
  });

  it("re-syncs every owner whose paid period is behind us, once each", async () => {
    queues.subscriptions = [
      {
        data: [
          { player_id: "p1", store_id: null },
          { player_id: "p1", store_id: null },
          { player_id: null, store_id: "s1" },
        ],
        error: null,
      },
    ];
    const response = await cron.GET(cronRequest("cron-secret-1"));
    expect(await response.json()).toEqual({
      ok: true,
      players: 1,
      stores: 1,
      failed: false,
    });
    expect(syncPlayer).toHaveBeenCalledTimes(1);
    expect(syncPlayer).toHaveBeenCalledWith("p1");
    expect(syncStore).toHaveBeenCalledWith("s1");
  });

  it("is scheduled", () => {
    const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    expect(vercel).toContain('"/api/cron/subscriptions"');
  });
});

describe("customer.subscription.deleted", () => {
  it("ends the entitlement now rather than at the old period end", async () => {
    const before = Date.now();
    expect(await markStripeSubscriptionCanceled("sub_1")).toBe("written");
    const patch = updates[0] as { status: string; current_period_end: string };
    expect(patch.status).toBe("canceled");
    expect(Date.parse(patch.current_period_end)).toBeGreaterThanOrEqual(before - 1);
    expect(Date.parse(patch.current_period_end)).toBeLessThanOrEqual(Date.now());
  });
});

describe("sandbox purchases", () => {
  it("entitle freely off production", () => {
    expect(sandboxMayEntitle("p1", { VERCEL_ENV: "preview" })).toBe(true);
    expect(sandboxMayEntitle("p1", {})).toBe(true);
  });

  it("are accepted on production by default, so App Review's sandbox purchase unlocks Pro", () => {
    expect(sandboxMayEntitle("p1", { VERCEL_ENV: "production" })).toBe(true);
  });

  it("are refused on production once APPLE_REJECT_SANDBOX is set, unless switched on or allow-listed", () => {
    const strict = { VERCEL_ENV: "production", APPLE_REJECT_SANDBOX: "1" };
    expect(sandboxMayEntitle("p1", strict)).toBe(false);
    expect(sandboxMayEntitle("p1", { ...strict, APPLE_ALLOW_SANDBOX: "1" })).toBe(true);
    expect(sandboxMayEntitle("p1", { ...strict, APPLE_SANDBOX_PLAYER_IDS: "p0, p1" })).toBe(
      true,
    );
    expect(sandboxMayEntitle("p2", { ...strict, APPLE_SANDBOX_PLAYER_IDS: "p0, p1" })).toBe(
      false,
    );
  });

  it("are checked on both doors: the app's sync and Apple's webhook", () => {
    for (const file of [
      "src/app/api/v1/billing/apple/route.ts",
      "src/app/api/webhooks/apple/route.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).toContain('lookup.environment === "sandbox" && !sandboxMayEntitle(');
    }
  });
});

describe("Apple's webhook when our side fails", () => {
  it("answers non-2xx so Apple retries", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/webhooks/apple/route.ts"),
      "utf8",
    );
    expect(source).toMatch(
      /lookup\.outcome === "error" \|\| lookup\.outcome === "not-configured"\)\s*\{\s*return retryLater\(\);/,
    );
    expect(source).toContain('if (written === "unavailable") return retryLater();');
    expect(source).toContain("{ status: 503 }");
  });
});
