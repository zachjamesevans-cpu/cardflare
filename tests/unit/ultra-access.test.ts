import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ultra's lock. The founder: "Ultra unlocks FlareCast, store profiles,
 * and the other stuff." A store passes on `stores.tier` (the webhook's
 * and the admin's column), and everything is open while billing is not
 * switched on, because a lock with no way to pay strands every store.
 */

let sellable = true;
let tier: string | null = "free";
let readError: { message: string } | null = null;

vi.mock("@/lib/stores/ultra", () => ({ ultraIsSellable: () => sellable }));
vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: tier === null ? null : { tier },
            error: readError,
          }),
        }),
      }),
    }),
  }),
}));

const { storeHasFeature, tierHasFeature } = await import("@/lib/stores/ultra-access");
const { FEATURE_TIERS } = await import("@/lib/billing/features");

beforeEach(() => {
  sellable = true;
  tier = "free";
  readError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Ultra's features", () => {
  it("are FlareCast, singles, posts, the case and the early-board push", () => {
    for (const feature of [
      "flarecast",
      "singles",
      "storePosts",
      "storeCase",
      "earlyBoardPush",
    ] as const) {
      expect(FEATURE_TIERS[feature]).toBe("ultra");
    }
  });

  it("are shut to a free store and open to an Ultra or Max one, comped or paid", () => {
    expect(tierHasFeature("flarecast", "free")).toBe(false);
    expect(tierHasFeature("flarecast", null)).toBe(false);
    expect(tierHasFeature("flarecast", "ultra")).toBe(true);
    expect(tierHasFeature("flarecast", "max")).toBe(true);
  });

  it("are open to everyone while billing is not switched on", () => {
    sellable = false;
    expect(tierHasFeature("flarecast", "free")).toBe(true);
  });

  it("read the store's own tier", async () => {
    await expect(storeHasFeature("store-1", "singles")).resolves.toBe(false);
    tier = "ultra";
    await expect(storeHasFeature("store-1", "singles")).resolves.toBe(true);
  });

  /* A shop's TV going dark on a Friday because one read hiccuped is the
     worse failure. */
  it("stay open when the plan cannot be read", async () => {
    readError = { message: "down" };
    await expect(storeHasFeature("store-1", "flarecast")).resolves.toBe(true);
  });
});
