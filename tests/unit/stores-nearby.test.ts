import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Which stores a player can be near — the query the whole Local tab rests on.
 *
 * The fault this file exists for: `stores.latitude` arrived with the store
 * directory and is written by ONE thing, the Overture import. Every store
 * that signed up as a customer — which is every store that actually hosts a
 * room, and so the only kind that can have a Flare on a board — had null
 * coordinates and was excluded by the bounding box. Local asks for stores
 * near you and then asks those stores for their boards, so it was asking the
 * one set of stores guaranteed to have none, and a player standing inside a
 * shop with an open board was told nothing was on within a hundred miles.
 *
 * A postal code is the fallback, at the coarse resolution the rest of the
 * location work already accepts. These tests hold that fallback in place and
 * hold the older promise with it: a store's coordinate never leaves here.
 */

type Response = Record<string, unknown>;

function chain(response: Response) {
  const c: Record<string, unknown> = {};

  for (const method of [
    "select",
    "eq",
    "gte",
    "lte",
    "in",
    "or",
    "not",
    "limit",
    "order",
  ]) {
    c[method] = vi.fn(() => c);
  }

  c.maybeSingle = () => Promise.resolve(response);
  c.then = (resolve: (v: Response) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(response).then(resolve, reject);

  return c;
}

/** Responses handed out in call order: the box query, then the postal one. */
let responses: Response[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: () => chain(responses.shift() ?? { data: [], error: null }),
  }),
}));

const { storesNear, milesBetween } = await import("@/lib/stores/nearby");

/** Eugene, Oregon — where the founder's simulator stands. */
const ORIGIN = { latitude: 44.0521, longitude: -123.0868 };

function store(over: Record<string, unknown> = {}) {
  return {
    id: "store-1",
    name: "Mox Valley Games",
    city: "Springfield",
    region: "OR",
    address_line: "1 Main St",
    postal_code: null,
    latitude: null,
    longitude: null,
    claim_status: "claimed",
    tier: "free",
    verified_at: null,
    ...over,
  };
}

beforeEach(() => {
  responses = [];
});

describe("storesNear", () => {
  it("returns a store that carries its own coordinate", async () => {
    responses = [
      { data: [store({ latitude: 44.0585, longitude: -123.0116 })], error: null },
      { data: [], error: null },
    ];

    const found = await storesNear(ORIGIN, 10);

    expect(found).toHaveLength(1);
    expect(found[0].name).toBe("Mox Valley Games");
  });

  it("finds a store located only by its postal code", async () => {
    /* The regression. This row is exactly what a customer store looks
       like: it runs rooms, it has an address, and nobody ever asked it
       for a latitude. */
    responses = [
      { data: [], error: null },
      { data: [store({ postal_code: "97477" })], error: null },
    ];

    const found = await storesNear(ORIGIN, 10);

    expect(found).toHaveLength(1);
    expect(found[0].storeId).toBe("store-1");
  });

  it("measures a postal-code store from its ZIP's centroid", async () => {
    responses = [
      { data: [], error: null },
      { data: [store({ postal_code: "97477" })], error: null },
    ];

    const found = await storesNear(ORIGIN, 100);

    /* 97477's centroid, to the tenth the caller is given. */
    const expected =
      Math.round(
        milesBetween(ORIGIN, { latitude: 44.0585, longitude: -123.0116 }) * 10,
      ) / 10;
    expect(found[0].miles).toBe(expected);
  });

  it("drops a postal-code store outside the radius", async () => {
    responses = [
      { data: [], error: null },
      /* Austin, Texas. Real ZIP, wrong state. */
      { data: [store({ postal_code: "78701" })], error: null },
    ];

    expect(await storesNear(ORIGIN, 100)).toEqual([]);
  });

  it("leaves out a store with neither a coordinate nor a real postal code", async () => {
    responses = [
      { data: [], error: null },
      { data: [store({ postal_code: "not-a-zip" })], error: null },
    ];

    /* Honest rather than guessed: nothing here knows where it is. */
    expect(await storesNear(ORIGIN, 100)).toEqual([]);
  });

  it("prefers a store's own coordinate over its postal code", async () => {
    responses = [
      {
        data: [
          store({ latitude: 44.0585, longitude: -123.0116, postal_code: "78701" }),
        ],
        error: null,
      },
      { data: [], error: null },
    ];

    const found = await storesNear(ORIGIN, 100);
    const expected =
      Math.round(
        milesBetween(ORIGIN, { latitude: 44.0585, longitude: -123.0116 }) * 10,
      ) / 10;
    expect(found[0].miles).toBe(expected);
  });

  it("never hands back a coordinate, whichever way the store was located", async () => {
    responses = [
      {
        data: [store({ id: "placed", latitude: 44.06, longitude: -123.08 })],
        error: null,
      },
      { data: [store({ id: "zipped", postal_code: "97477" })], error: null },
    ];

    const found = await storesNear(ORIGIN, 100);

    expect(found).toHaveLength(2);
    for (const row of found) {
      expect(row).not.toHaveProperty("latitude");
      expect(row).not.toHaveProperty("longitude");
      expect(row).not.toHaveProperty("postal_code");
    }
  });

  it("sorts by distance across both ways of being located", async () => {
    responses = [
      /* Roughly four miles out, with a real coordinate. */
      {
        data: [store({ id: "far", latitude: 44.0585, longitude: -123.0116 })],
        error: null,
      },
      /* Eugene's own ZIP, a few blocks from the origin. */
      { data: [store({ id: "near", postal_code: "97401" })], error: null },
    ];

    const found = await storesNear(ORIGIN, 100);

    expect(found.map((row) => row.storeId)).toEqual(["near", "far"]);
  });

  it("returns nothing when either query fails, rather than a half list", async () => {
    responses = [
      { data: null, error: { message: "boom" } },
      { data: [store({ postal_code: "97477" })], error: null },
    ];

    expect(await storesNear(ORIGIN, 100)).toEqual([]);
  });
});
