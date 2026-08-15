import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { EQUIP_KINDS, isEquipKind } from "@/lib/players/equips";

/**
 * The equip slots exist twice: once in code (EQUIP_KINDS drives the
 * customize hub, the API schema and the app's sections) and once in the
 * database (player_equips' kind check constraint). These tests pin the
 * two lists to each other, so adding a category in one place without
 * the other fails here instead of failing as a 500 on somebody's tap.
 */

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260910090000_player_equips.sql"),
  "utf8",
);

/** The kinds the check constraint accepts, read from the migration. */
function constraintKinds(): string[] {
  const check = migration.match(/kind text not null\s+check \(kind in \(([^)]+)\)/);
  if (!check) throw new Error("player_equips kind check not found in the migration");
  return [...check[1].matchAll(/'([a-z]+)'/g)].map((hit) => hit[1]);
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
