import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ownsCosmetic, type OwnedCosmetics } from "@/lib/players/cosmetics";
import { CATALOG_KINDS, KIND_LABELS } from "@/lib/admin/catalog";
import {
  packSetItemSchema,
  packSetSchema,
  renameCosmeticSchema,
  slugFromName,
} from "@/lib/admin/catalog-schema";
import { tidyCosmeticName } from "@/lib/players/cosmetic-names";

/**
 * The draft catalogue's one job is to stay invisible, and the rule that
 * keeps it invisible is `ownsCosmetic`. Everything downstream — the
 * store, the wardrobe, equipping, the app — asks that function, so these
 * are the tests that decide whether an unreleased cosmetic can leak.
 */

const migrationSql = readdirSync(join(process.cwd(), "supabase/migrations"))
  .map((file) => readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8"))
  .join("\n");

const nobody: OwnedCosmetics = {
  purchased: new Set(),
  unlockedAll: false,
  unlockedDraft: false,
};

describe("draft cosmetics stay behind the scenes", () => {
  it("a draft is not owned by an ordinary player, free price and all", () => {
    expect(
      ownsCosmetic({ slug: "ring-inferno", cost_embers: 0, status: "draft" }, nobody),
    ).toBe(false);
  });

  it("the ordinary unlock-all grant does NOT reach the draft catalogue", () => {
    expect(
      ownsCosmetic(
        { slug: "ring-inferno", cost_embers: 0, status: "draft" },
        { ...nobody, unlockedAll: true },
      ),
    ).toBe(false);
  });

  it("only the admin everything-grant reaches a draft", () => {
    expect(
      ownsCosmetic(
        { slug: "ring-inferno", cost_embers: 0, status: "draft" },
        { ...nobody, unlockedDraft: true },
      ),
    ).toBe(true);
  });

  it("somehow owning the row is still not enough for a draft", () => {
    expect(
      ownsCosmetic(
        { slug: "ring-inferno", cost_embers: 0, status: "draft" },
        { ...nobody, purchased: new Set(["ring-inferno"]) },
      ),
    ).toBe(false);
  });

  it("live cosmetics keep working exactly as they did", () => {
    const item = { slug: "prism-edge", cost_embers: 600, status: "live" as const };
    expect(ownsCosmetic(item, nobody)).toBe(false);
    expect(ownsCosmetic(item, { ...nobody, unlockedAll: true })).toBe(true);
    expect(ownsCosmetic(item, { ...nobody, purchased: new Set(["prism-edge"]) })).toBe(
      true,
    );
    expect(
      ownsCosmetic({ slug: "plain", cost_embers: 0, status: "live" }, nobody),
    ).toBe(true);
  });
});

describe("the catalogue's shape", () => {
  it("every kind the console lists is one the database will accept", () => {
    const match = migrationSql.match(
      /add constraint cosmetics_kind_check\s+check \(kind in \(([\s\S]*?)\)\)/,
    );
    expect(match, "no cosmetics_kind_check found").toBeTruthy();
    const allowed = [...(match?.[1] ?? "").matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);

    for (const kind of CATALOG_KINDS) {
      expect(allowed, kind).toContain(kind);
    }
  });

  it("every kind has a heading, so no group renders nameless", () => {
    for (const kind of CATALOG_KINDS) {
      expect(KIND_LABELS[kind]?.title?.length ?? 0, kind).toBeGreaterThan(0);
    }
  });

  it("the seeded catalogue is entirely draft", () => {
    const seed = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260907090000_cosmetic_catalog_seed.sql",
      ),
      "utf8",
    );
    /* Every value row ends with its status; none may say 'live'. */
    expect(seed).not.toMatch(/,\s*'live'\)/);
    expect((seed.match(/'draft'\)/g) ?? []).length).toBeGreaterThan(200);
  });
});

describe("building a set", () => {
  it("derives a usable slug from a typed name", () => {
    expect(slugFromName("Embers & Ash")).toBe("embers-ash");
    expect(slugFromName("  Set Two!  ")).toBe("set-two");
  });

  it("refuses a set number below one", () => {
    const parsed = packSetSchema.safeParse({
      slug: "embers",
      name: "Embers",
      setNumber: "0",
      description: "",
      priceEmbers: "300",
      slots: "3",
      releaseAt: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a whole set, release date left blank", () => {
    const parsed = packSetSchema.safeParse({
      slug: "embers",
      name: "Embers",
      setNumber: "2",
      description: "The second one.",
      priceEmbers: "300",
      slots: "3",
      releaseAt: "",
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses an item with no chance of appearing", () => {
    const parsed = packSetItemSchema.safeParse({
      seriesSlug: "embers",
      cosmeticSlug: "ring-inferno",
      rarity: "rare",
      weight: "0",
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses a rarity nobody defined", () => {
    const parsed = packSetItemSchema.safeParse({
      seriesSlug: "embers",
      cosmeticSlug: "ring-inferno",
      rarity: "mythic",
      weight: "10",
    });
    expect(parsed.success).toBe(false);
  });
});

/**
 * Renaming from the console, which the founder asked to "change it
 * across all platforms live - the app, website, etc." It does, because
 * every surface selects the name off the row. What must NOT move is the
 * slug: ownership, sets, equips and the art rule all point at it.
 */
describe("renaming a cosmetic", () => {
  it("takes a name and the slug of the thing to rename", () => {
    const parsed = renameCosmeticSchema.safeParse({
      slug: "ring-lightning",
      name: "Storm",
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses a blank name rather than saving an unnamed cosmetic", () => {
    const parsed = renameCosmeticSchema.safeParse({
      slug: "ring-lightning",
      name: "   ",
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses a name longer than the column holds", () => {
    const parsed = renameCosmeticSchema.safeParse({
      slug: "ring-lightning",
      name: "x".repeat(61),
    });
    expect(parsed.success).toBe(false);
  });

  it("has no way to ask for a different slug", () => {
    /* The shape is the guard: an extra field is dropped, so a crafted
       post cannot move a cosmetic's identity out from under its
       owners. */
    const parsed = renameCosmeticSchema.safeParse({
      slug: "ring-lightning",
      name: "Storm",
      newSlug: "ring-storm",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual({ slug: "ring-lightning", name: "Storm" });
  });

  it("still obeys the naming rule the upload door obeys", () => {
    /* renameCosmetic runs the typed name through this before saving. */
    expect(tidyCosmeticName("ring", "Storm Border")).toBe("Storm");
  });
});
