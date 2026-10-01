import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { isOnePieceSet } from "@/components/admin/set-list";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

/**
 * The admin console half of the 2026-10-01 audit: a merge for duplicate
 * stores, chips that point them out, a spot check that keeps score, a
 * failures box at the top of the dashboard, the set codes on their own
 * page, and a players list with a join date and a sort.
 */
describe("merging a store", () => {
  it("is offered on the store's page, above the danger zone", () => {
    const page = read("src/app/admin/stores/[id]/page.tsx");
    expect(page).toContain('from "@/components/admin/merge-panel"');
    expect(page.indexOf("Merge into another store")).toBeLessThan(
      page.indexOf("Danger zone"),
    );
    expect(page).toContain("was merged into this store.");
  });

  it("needs the survivor's name typed back and shows a blocked merge without a button", () => {
    const panel = read("src/components/admin/merge-panel.tsx");
    expect(panel).toContain('name="confirmName"');
    expect(panel).toContain('label="Probably the same shop"');
    expect(panel).toContain("preview.blocked ? (");
    expect(panel).toContain("then {preview.from.name} is deleted.");
  });
});

describe("duplicate chips in the directory", () => {
  it("names the other row and filters down to the pairs", () => {
    const directory = read("src/components/admin/store-directory.tsx");
    expect(directory).toContain("Possibly the same as");
    expect(directory).toContain("Possible duplicates");
    expect(directory).toContain("duplicateOf: string[]");

    const page = read("src/app/admin/stores/page.tsx");
    expect(page).toContain("likelyDuplicates(stores)");
  });
});

describe("the spot check keeps score", () => {
  it("has a verdict row per card and no longer assumes One Piece", () => {
    const page = read("src/app/admin/spot-check/page.tsx");
    const row = read("src/components/admin/spot-check-row.tsx");
    const both = page + row;
    expect(both).toContain("Looks right");
    expect(row).toMatch(/variant="danger"[^>]*>\s*Wrong\s*<\/Button>/);
    expect(page).not.toContain("One Piece card list");
    expect(page).toContain("checked · {wrong} wrong");
    expect(page).toContain("Plain text, for pasting elsewhere");
    expect(row).toContain('value="clear"');
    expect(row).toContain("gameShortName(card.game)");
  });
});

describe("what went wrong lately", () => {
  it("sits on the dashboard between Right now and Manage", () => {
    const page = read("src/app/admin/page.tsx");
    expect(page).toContain('from "@/components/admin/failures-box"');
    expect(page).toContain("What went wrong lately");
    expect(page.indexOf("What went wrong lately")).toBeGreaterThan(
      page.indexOf("Right now"),
    );
    expect(page.indexOf("What went wrong lately")).toBeLessThan(page.indexOf("Manage"));
  });

  it("colours a stale sync amber and a failure red, and says what it cannot see", () => {
    const box = read("src/components/admin/failures-box.tsx");
    expect(box).toContain('failure.kind === "sync-stale" ? "bg-warning" : "bg-danger"');
    expect(box).toContain("Nothing failed in the last 30 days.");
    expect(box).toContain("blindSpots.map");
  });
});

describe("sets off the dashboard", () => {
  it("has its own page, which the dashboard links to", () => {
    expect(existsSync(resolve(root, "src/app/admin/cards/sets/page.tsx"))).toBe(true);
    const health = read("src/components/admin/catalog-health.tsx");
    expect(health).toContain('href="/admin/cards/sets"');
    expect(health).toContain("See every set");
    expect(health).not.toContain("max-h-72");
  });

  it("groups One Piece codes under their own heading", () => {
    for (const code of ["OP-07", "OP07", "ST-01", "EB-01", "PRB-01", "P"]) {
      expect(isOnePieceSet(code)).toBe(true);
    }
    for (const code of ["MKM", "OGN", "TFC", "sv1", "(no set code)"]) {
      expect(isOnePieceSet(code)).toBe(false);
    }
    const list = read("src/components/admin/set-list.tsx");
    expect(list).toContain('title="One Piece"');
    expect(list).toContain('title="Other games"');
  });
});

describe("the players page", () => {
  it("shows when they joined and when they were last in a room, and sorts", () => {
    const page = read("src/app/admin/players/page.tsx");
    const row = read("src/components/admin/admin-player-row.tsx");
    expect(row).toContain("Last in a room");
    expect(row).toContain("Never in a room");
    expect(row).toContain("Joined {shortDate(joinedAt)}");
    expect(page).toContain("PlayerSortControl");
    expect(page).toContain('params.sort === "active" || params.sort === "name"');

    const control = read("src/components/admin/player-sort.tsx");
    expect(control).toContain("Most recent in a room");
    expect(control).toContain('joined: "Newest"');
    expect(control).toContain('name: "Name"');
  });
});
