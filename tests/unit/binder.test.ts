import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  BINDER_COVERS,
  binderCountLine,
  binderCover,
  binderMatchLine,
  DEFAULT_BINDER_COVER,
  DEFAULT_BINDER_LAYOUT,
  isBinderCover,
  pocketsPerPage,
} from "@/lib/binder/covers";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * The binder's covers, pages and words. The model itself is pinned in
 * binders.test.ts.
 */

describe("the binder's covers", () => {
  it("are a short list of flat colours, named by colour only", () => {
    expect(BINDER_COVERS.length).toBeGreaterThanOrEqual(5);
    for (const cover of BINDER_COVERS) {
      /* The heading says Cover, so the name does not. */
      expect(cover.name.toLowerCase()).not.toContain("cover");
      expect(cover.edge).toMatch(/^var\(--color-/);
      expect(cover.spine).toMatch(/^var\(--color-/);
    }
    expect(isBinderCover(DEFAULT_BINDER_COVER)).toBe(true);
    expect(isBinderCover("holo-animated")).toBe(false);
    expect(binderCover("gold").name).toBe("Gold");
  });

  it("have no literal hex and no animation", () => {
    /* The comments quote the founder's "no animated stuff yet"; the
       code is what must not carry one. */
    const source = read("src/lib/binder/covers.ts").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(source).not.toMatch(/#[0-9a-f]{6}/i);
    expect(source).not.toMatch(/animation|keyframes|rive/i);
  });

  it("pages are three by three", () => {
    expect(DEFAULT_BINDER_LAYOUT).toBe(3);
    expect(pocketsPerPage(3)).toBe(9);
  });

  it("says the count and the match in plain words", () => {
    expect(binderCountLine(0)).toBe("Nothing to trade yet");
    expect(binderCountLine(1)).toBe("1 card to trade");
    expect(binderCountLine(24)).toBe("24 cards to trade");
    expect(binderMatchLine(0)).toBeNull();
    expect(binderMatchLine(3)).toBe("3 on your hunts");
  });
});

describe("the binder's order is the owner's", () => {
  const lib = read("src/lib/binder/binder.ts");

  it("keeps a pocket per card on the row itself", () => {
    const migration = read("supabase/migrations/20261025090000_binder_order.sql");
    expect(migration).toContain("alter table public.player_cards");
    expect(migration).toContain("add column if not exists position integer");
    expect(read("supabase/migrations/20261026090000_custom_binders.sql")).toContain(
      "position integer,",
    );
  });

  it("puts a card that has no pocket yet first, newest first", () => {
    expect(lib).toContain("if (a.position === null) return -1;");
    expect(lib).toContain("return b.created_at.localeCompare(a.created_at);");
  });

  it("never loses a card a stale screen left out of the order", () => {
    expect(lib).toContain("export async function saveBinderOrder(");
    expect(lib).toContain("const order = [...placed, ...rest];");
    expect(lib).toContain('.eq("binder_id", binderId)');
  });

  it("is written from the website and the app alike", () => {
    expect(read("src/lib/binder/actions.ts")).toContain(
      "export async function reorderBinderAction(",
    );
    const route = read("src/app/api/v1/binders/[binderId]/order/route.ts");
    expect(route).toContain("export async function PUT");
    expect(route).toContain(
      "saveBinderOrder(player.playerId, parsed.data.entryIds, id.data)",
    );
  });
});
