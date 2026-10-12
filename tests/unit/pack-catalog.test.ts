import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Packs built in the admin console can be bought and opened.
 *
 * They were saved to `pack_series` but buying and opening only knew the
 * code's SERIES map (Origin), so a console set was advertised and could
 * not be bought. lib/packs/catalog.ts is the one door now; this pins
 * what "ready to sell" means.
 */

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

/* A query builder over plain arrays: select, eq and in filter rows. */
function query(rows: Row[]) {
  let current = rows;
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      current = current.filter((row) => row[column] === value);
      return builder;
    },
    in: (column: string, values: unknown[]) => {
      current = current.filter((row) => values.includes(row[column]));
      return builder;
    },
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
      resolve({ data: current, error: null }),
  };
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({ from: (table: string) => query(tables[table] ?? []) }),
}));

vi.mock("@/lib/admin/pack-sets", () => ({
  packArtSrc: (path: string | null) => (path ? `/art/${path}` : null),
}));

const { seriesById, shopSeries } = await import("@/lib/packs/catalog");

function set(slug: string, extra: Row = {}): Row {
  return {
    slug,
    name: slug,
    set_number: 2,
    description: "",
    price_embers: 300,
    slots: 2,
    release_at: null,
    art_path: null,
    status: "live",
    ...extra,
  };
}

beforeEach(() => {
  tables.pack_series = [
    set("sakura"),
    set("unfinished", { set_number: 3 }),
    set("later", { set_number: 4, release_at: "2999-01-01T00:00:00Z" }),
    set("hidden", { set_number: 5, status: "draft" }),
  ];
  tables.pack_series_items = [
    { series_slug: "sakura", cosmetic_slug: "aura-sakura", rarity: "rare", weight: 30 },
    {
      series_slug: "sakura",
      cosmetic_slug: "ring-sakura",
      rarity: "common",
      weight: 70,
    },
    /* Weights that do not reach 100. */
    {
      series_slug: "unfinished",
      cosmetic_slug: "aura-sakura",
      rarity: "rare",
      weight: 30,
    },
    {
      series_slug: "unfinished",
      cosmetic_slug: "ring-sakura",
      rarity: "common",
      weight: 30,
    },
    { series_slug: "later", cosmetic_slug: "aura-sakura", rarity: "rare", weight: 50 },
    {
      series_slug: "later",
      cosmetic_slug: "ring-sakura",
      rarity: "common",
      weight: 50,
    },
    { series_slug: "hidden", cosmetic_slug: "aura-sakura", rarity: "rare", weight: 50 },
    {
      series_slug: "hidden",
      cosmetic_slug: "ring-sakura",
      rarity: "common",
      weight: 50,
    },
  ];
  tables.cosmetics = [
    { slug: "aura-sakura", name: "Sakura", status: "live" },
    { slug: "ring-sakura", name: "Sakura Ring", status: "live" },
  ];
});

describe("packs on sale", () => {
  it("sells Origin and every ready console set, newest first", async () => {
    const ids = (await shopSeries()).map((series) => series.id);
    expect(ids).toEqual(["sakura", "origin"]);
  });

  it("names a console set's pulls and draws from its own pool", async () => {
    const sakura = await seriesById("sakura");
    expect(sakura?.names).toEqual({
      "aura-sakura": "Sakura",
      "ring-sakura": "Sakura Ring",
    });
    expect(sakura?.pool.map((entry) => entry.slug)).toEqual([
      "ring-sakura",
      "aura-sakura",
    ]);
  });

  it("refuses a set short of 100, not yet released, or not live", async () => {
    expect(await seriesById("unfinished")).toBeNull();
    expect(await seriesById("later")).toBeNull();
    expect(await seriesById("hidden")).toBeNull();
  });

  it("refuses a set with a draft item in it", async () => {
    tables.cosmetics[0].status = "draft";
    expect(await seriesById("sakura")).toBeNull();
  });

  it("still opens a pack already held from a set since taken off sale", async () => {
    expect(await seriesById("hidden", { opening: true })).not.toBeNull();
    expect(await seriesById("later", { opening: true })).not.toBeNull();
  });
});
