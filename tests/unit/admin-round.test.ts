import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { duplicatesOf, likelyDuplicates } from "@/lib/admin/duplicates";
import { printingLabel } from "@/lib/cards/schema";
import { canonicalSetCode, stripNumberFromName } from "@/lib/cards/set-codes";

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

/**
 * The admin round of the 2026-10-01 audit: duplicate set codes,
 * numbers inside names, rarities printed twice, duplicate stores, and a
 * spot check with no score.
 */
describe("one spelling per set", () => {
  it("writes the dash Bandai writes", () => {
    expect(canonicalSetCode("OP02")).toBe("OP-02");
    expect(canonicalSetCode("op-02")).toBe("OP-02");
    expect(canonicalSetCode("ST01")).toBe("ST-01");
    expect(canonicalSetCode("EB01")).toBe("EB-01");
    expect(canonicalSetCode("PRB01")).toBe("PRB-01");
  });

  it("leaves everything else alone", () => {
    expect(canonicalSetCode("P")).toBe("P");
    expect(canonicalSetCode("OP14-EB04")).toBe("OP14-EB04");
    expect(canonicalSetCode("MKM")).toBe("MKM");
    expect(canonicalSetCode("")).toBeNull();
    expect(canonicalSetCode(null)).toBeNull();
  });

  it("is applied on both write paths and by the migration", () => {
    expect(read("src/lib/cards/sync.ts")).toContain(
      "canonicalSetCode(printing.setCode)",
    );
    expect(read("src/lib/cards/import.ts")).toContain(
      "canonicalSetCode(manifest.setCode)",
    );
    expect(read("supabase/migrations/20261021090000_admin_round.sql")).toContain(
      "regexp_replace(set_code, '^(OP|ST|EB|PRB)(\\d+)$', '\\1-\\2')",
    );
  });
});

describe("a name is a name", () => {
  it("drops a trailing card number however it was joined", () => {
    expect(stripNumberFromName("Trafalgar Law - OP14-009", "OP14-009")).toBe(
      "Trafalgar Law",
    );
    expect(stripNumberFromName("Jewelry Bonney -PRB02-004", "PRB02-004")).toBe(
      "Jewelry Bonney",
    );
    expect(stripNumberFromName("Nami OP01-016", "OP01-016")).toBe("Nami");
  });

  it("keeps a name that does not end in its number, and never empties one", () => {
    expect(stripNumberFromName("Monkey.D.Luffy", "OP01-001")).toBe("Monkey.D.Luffy");
    expect(stripNumberFromName("OP01-001", "OP01-001")).toBe("OP01-001");
  });
});

describe("a rarity is printed once", () => {
  const printing = {
    id: "p",
    setCode: "OP-10",
    setName: null,
    printingLabel: null,
    variantType: "TR",
    rarity: "TR",
    printingName: null,
    isPromo: false,
    imageUrl: null,
  };

  it("drops a variant that only repeats the rarity", () => {
    expect(printingLabel(printing)).toBe("OP-10 · TR");
    expect(printingLabel({ ...printing, variantType: "Alternate Art" })).toBe(
      "OP-10 · TR · Alternate Art",
    );
  });
});

describe("stores that are probably the same shop", () => {
  const stores = [
    { id: "a", name: "Castle Of Games", city: "Springfield", region: "OR" },
    { id: "b", name: "Castle of Games", city: "Springfield", region: "OR" },
    { id: "c", name: "King's Hobby", city: null, region: "OR" },
    { id: "d", name: "King's Hobby Shop", city: null, region: "OR" },
    { id: "e", name: "Mox Valley Games", city: "Eugene", region: "OR" },
    { id: "f", name: "Mox Valley Games", city: "Springfield", region: "WA" },
    { id: "g", name: "The Game Store", city: null, region: null },
  ];

  it("groups by name with the noise words out, within a region", () => {
    const groups = likelyDuplicates(stores);
    expect(duplicatesOf(stores[0], groups).map((s) => s.id)).toEqual(["b"]);
    expect(duplicatesOf(stores[2], groups).map((s) => s.id)).toEqual(["d"]);
    /* Different regions are different shops with the same name. */
    expect(duplicatesOf(stores[4], groups)).toEqual([]);
    /* A name made only of noise words matches nobody. */
    expect(duplicatesOf(stores[6], groups)).toEqual([]);
  });
});

describe("merging a store", () => {
  const lib = read("src/lib/admin/merge-stores.ts");
  const actions = read("src/lib/admin/merge-actions.ts");

  it("moves every table that points at a store, one-each rows deduped", () => {
    for (const table of [
      "events",
      "player_locals",
      "store_members",
      "store_invites",
      "store_claims",
      "store_sources",
      "event_hub_displays",
      "store_singles",
      "store_singles_syncs",
      "store_games",
      "store_posts",
      "store_case_picks",
      "show_vendors",
      "vendor_inventory",
    ]) {
      expect(lib).toContain(`table: "${table}"`);
    }
    expect(lib).toContain('if (bulk.error.code !== "23505" || !entry.oneEach)');
  });

  it("refuses when both stores pay, and never overwrites what the survivor says", () => {
    expect(lib).toContain("Both stores have a subscription.");
    expect(lib).toContain(
      "if (into[key] === null && from[key] !== null) fill[key] = from[key];",
    );
  });

  it("needs the survivor's name typed back, and is admin only", () => {
    expect(actions).toContain("await requireAdmin();");
    expect(actions).toContain("typed !== preview.into.name.trim().toLowerCase()");
  });
});

describe("the spot check keeps score", () => {
  it("has a verdict per card, admin only, and the dashboard counts the wrong ones", () => {
    const migration = read("supabase/migrations/20261021090000_admin_round.sql");
    expect(migration).toContain("create table public.card_spot_checks");
    expect(migration).toContain("verdict in ('ok', 'wrong')");
    expect(read("src/lib/admin/spot-check-actions.ts")).toContain(
      "await requireAdmin();",
    );
    expect(read("src/lib/admin/failures.ts")).toContain('kind: "card-wrong"');
  });

  it("no longer assumes every card is One Piece", () => {
    const lib = read("src/lib/cards/spot-check.ts");
    expect(lib).not.toContain("official One Piece card list");
    expect(lib).toContain("game: row.game");
  });
});

describe("what went wrong lately", () => {
  const lib = read("src/lib/admin/failures.ts");

  it("judges each provider by its latest run and calls two weeks stale", () => {
    expect(lib).toContain("const STALE_DAYS = 14;");
    expect(lib).toContain("latestByProvider");
  });

  it("says what it cannot see", () => {
    expect(lib).toContain("Email and push delivery are not logged");
  });
});
