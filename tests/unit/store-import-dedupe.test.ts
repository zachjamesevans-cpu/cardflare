import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * One business, one row — enforced where it is actually decided.
 *
 * The store-directory migration opens by saying so: an unclaimed listing
 * and a paying customer are the same shop at two points in one funnel, and
 * a second row means "somebody has to move a row between them and re-point
 * every foreign key". `discover` had always computed this match and shown
 * it to the admin as "possible duplicate"; `importCandidates` ignored it
 * and inserted anyway.
 *
 * What that cost: rooms, events and Flares hang off the customer's row,
 * while the coordinate arrives on the imported one. Local finds stores by
 * coordinate and then asks them for their boards — so it found the row with
 * no boards, and could not find the row that had them. A player standing
 * inside a shop with an open board was told nothing was on within a hundred
 * miles, and both rows showed on the Feed under one name.
 */

type Response = Record<string, unknown>;

const calls: { table: string; op: string; payload: unknown }[] = [];
let stores: Response[] = [];
/** Provider ids already attached to a store, for the exact-match skip. */
let sources: string[] = [];

function chain(table: string, response: Response) {
  const c: Record<string, unknown> = {};
  let op = "select";

  for (const method of ["select", "eq", "in", "or", "not", "limit", "order"]) {
    c[method] = vi.fn(() => c);
  }
  for (const method of ["insert", "update", "upsert", "delete"]) {
    c[method] = vi.fn((payload: unknown) => {
      op = method;
      calls.push({ table, op: method, payload });
      return c;
    });
  }

  c.single = () => Promise.resolve({ data: { id: "created-row" }, error: null });
  c.maybeSingle = () => Promise.resolve(response);
  c.then = (resolve: (v: Response) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(op === "select" ? response : { data: null, error: null }).then(
      resolve,
      reject,
    );

  return c;
}

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "stores") return chain(table, { data: stores, error: null });
      if (table === "store_sources") {
        /* Serves both the schema probe and the per-candidate exact match. */
        return chain(table, {
          data: sources.length > 0 ? { store_id: "already" } : null,
          error: null,
        });
      }
      return chain(table, { data: null, error: null });
    },
  }),
}));

const { importCandidates } = await import("@/lib/stores/discovery");

function candidate(over: Record<string, unknown> = {}) {
  return {
    providerPlaceId: "gers-1",
    name: "Mox Valley Games",
    city: "Springfield",
    region: "OR",
    addressLine: "1000 Main St",
    postalCode: "97477",
    country: "US",
    latitude: 44.0585,
    longitude: -123.0116,
    phone: "+1 541 555 0100",
    website: "https://example.invalid",
    categories: ["trading_card_store"],
    confidence: 0.9,
    license: "CDLA-Permissive-2.0",
    attribution: "Overture Maps Foundation",
    ...over,
  } as Parameters<typeof importCandidates>[0][number];
}

function existingStore(over: Record<string, unknown> = {}) {
  return {
    id: "customer-row",
    name: "Mox Valley Games",
    city: "Springfield",
    address_line: null,
    postal_code: null,
    country: null,
    phone: null,
    website: null,
    latitude: null,
    longitude: null,
    ...over,
  };
}

beforeEach(() => {
  calls.length = 0;
  stores = [];
  sources = [];
});

const inserts = (table: string) =>
  calls.filter((c) => c.table === table && c.op === "insert");
const updates = (table: string) =>
  calls.filter((c) => c.table === table && c.op === "update");

describe("importing a shop cardflare already has", () => {
  it("does not create a second row for the same name in the same town", async () => {
    stores = [existingStore()];

    const result = await importCandidates([candidate()], null);

    expect(result.created).toBe(0);
    expect(result.enriched).toBe(1);
    expect(inserts("stores")).toHaveLength(0);
  });

  it("fills the customer row's missing coordinate, which is the whole point", async () => {
    stores = [existingStore()];

    await importCandidates([candidate()], null);

    const [update] = updates("stores");
    expect(update.payload).toMatchObject({
      latitude: 44.0585,
      longitude: -123.0116,
      postal_code: "97477",
      address_line: "1000 Main St",
    });
  });

  it("records the provenance against the store it actually describes", async () => {
    stores = [existingStore()];

    await importCandidates([candidate()], "admin-1");

    expect(inserts("store_sources")[0].payload).toMatchObject({
      store_id: "customer-row",
      provider_place_id: "gers-1",
    });
  });

  it("never overwrites what the shop already told us", async () => {
    /* A claimed listing that corrected its own address must not be
       reverted by a places provider on the next import. */
    stores = [
      existingStore({
        address_line: "Unit 4, 1000 Main St",
        phone: "+1 541 555 9999",
        latitude: 44.06,
        longitude: -123.01,
      }),
    ];

    await importCandidates([candidate()], null);

    const [update] = updates("stores");
    expect(update.payload).not.toHaveProperty("address_line");
    expect(update.payload).not.toHaveProperty("phone");
    expect(update.payload).not.toHaveProperty("latitude");
    expect(update.payload).toMatchObject({ postal_code: "97477" });
  });

  it("matches on proximity when the town is spelled differently", async () => {
    stores = [
      existingStore({
        city: "Springfield-Eugene",
        latitude: 44.0586,
        longitude: -123.0117,
      }),
    ];

    const result = await importCandidates([candidate()], null);

    expect(result.enriched).toBe(1);
    expect(inserts("stores")).toHaveLength(0);
  });

  it("still creates a row for a shop that is genuinely new", async () => {
    stores = [existingStore({ name: "Emerald City Comics", city: "Eugene" })];

    const result = await importCandidates([candidate()], null);

    expect(result.enriched).toBe(0);
    expect(result.created).toBe(1);
    expect(inserts("stores")).toHaveLength(1);
  });

  it("leaves a different shop in a different town alone", async () => {
    stores = [existingStore({ city: "Austin" })];

    const result = await importCandidates([candidate({ city: "Springfield" })], null);

    expect(result.created).toBe(1);
  });
});
