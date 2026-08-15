import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { EQUIP_AREAS, EQUIP_KINDS, equipArea, isEquipKind } from "@/lib/players/equips";

/**
 * The equip slots exist twice: once in code (EQUIP_KINDS drives the
 * customize hub, the API schema and the app's sections) and once in the
 * database (player_equips' kind check constraint). These tests pin the
 * two lists to each other, so adding a category in one place without
 * the other fails here instead of failing as a 500 on somebody's tap.
 */

/**
 * The kinds the check constraint accepts, read from the migrations.
 *
 * Later migrations may drop and re-add the constraint (the aura split
 * did), so the LAST definition in filename order is the live one -
 * exactly what the database ends up enforcing.
 */
function constraintKinds(): string[] {
  const dir = join(process.cwd(), "supabase/migrations");
  let latest: string | null = null;
  for (const file of readdirSync(dir).sort()) {
    const sql = readFileSync(join(dir, file), "utf8");
    if (!sql.includes("player_equips")) continue;
    const at = sql.indexOf("player_equips");
    const check = sql.slice(at).match(/check \(kind in \(([^)]+)\)/);
    if (check) latest = check[1];
  }
  if (!latest) throw new Error("player_equips kind check not found in migrations");
  return [...latest.matchAll(/'([a-z]+)'/g)].map((hit) => hit[1]);
}

describe("EQUIP_KINDS match the player_equips migration", () => {
  it("code and constraint hold the same set of kinds", () => {
    expect([...constraintKinds()].sort()).toEqual([...EQUIP_KINDS].sort());
  });

  it("the shipped kinds equip through player columns, never through here", () => {
    for (const shipped of ["frame", "holo", "effect"]) {
      expect(EQUIP_KINDS).not.toContain(shipped);
      expect(isEquipKind(shipped)).toBe(false);
    }
  });

  it("isEquipKind accepts every kind and rejects a stranger", () => {
    for (const kind of EQUIP_KINDS) expect(isEquipKind(kind)).toBe(true);
    expect(isEquipKind("hat")).toBe(false);
    expect(isEquipKind("")).toBe(false);
  });
});

describe("the two wands cover the whole wardrobe between them", () => {
  it("profile + showcase partition EQUIP_KINDS: no gaps, no overlap", () => {
    const together = [...EQUIP_AREAS.profile, ...EQUIP_AREAS.showcase];
    expect([...together].sort()).toEqual([...EQUIP_KINDS].sort());
    expect(new Set(together).size).toBe(together.length);
  });

  it("an unknown or missing area falls back to profile", () => {
    expect(equipArea(undefined)).toBe("profile");
    expect(equipArea("showcase")).toBe("showcase");
    expect(equipArea("nonsense")).toBe("profile");
  });
});
