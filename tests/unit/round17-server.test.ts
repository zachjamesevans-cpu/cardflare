import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { signedInHome } from "@/lib/auth/redirect";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * Round 17, the server and admin half: the catalogue counted once in the
 * database, a console front page that counts instead of listing, honest
 * grammar, notices that cannot name yourself, spot-check fields by game,
 * a poster address that goes somewhere, and a player's login landing.
 */

describe("the catalogue's sets are counted in the database", () => {
  it("has one aggregate, service role only, distinct cards per game and set", () => {
    const migration = read("supabase/migrations/20261031090000_catalog_sets.sql");
    expect(migration).toContain("create or replace function public.catalog_sets()");
    expect(migration).toContain("count(distinct p.card_id) as cards");
    expect(migration).toContain("group by c.game, p.set_code");
    expect(migration).toContain(
      "revoke all on function public.catalog_sets() from public, anon, authenticated;",
    );
    expect(read("src/lib/supabase/types.ts")).toContain("catalog_sets: {");
  });

  it("is what both admin pages read, with no paged walk left", () => {
    const health = read("src/lib/cards/health.ts");
    expect(health).toContain('.rpc("catalog_sets")');
    expect(health).not.toContain('.from("card_printings")');
    expect(health).not.toContain("summariseSets");
    expect(read("src/app/admin/cards/sets/page.tsx")).toContain("catalogBySet()");
    expect(read("src/app/admin/page.tsx")).toContain("catalogBySet()");
  });

  it("names the game on the sets page instead of guessing from the code", () => {
    const list = read("src/components/admin/set-list.tsx");
    expect(list).toContain("gameLabel(game)");
    expect(list).toContain("set.setName");
    expect(list).not.toMatch(/ONE_PIECE = \//);
  });
});

describe("the console front page", () => {
  const page = read("src/app/admin/page.tsx");

  it("counts players instead of loading every row and session", () => {
    expect(page).toContain("countPlayers()");
    expect(page).not.toContain("listPlayersForAdmin");
    const accounts = read("src/lib/players/accounts.ts");
    expect(accounts).toContain("export async function countPlayers(");
    expect(accounts).toContain('.select("id", { count: "exact", head: true })');
  });

  it("says one record was refused, not were", () => {
    const failures = read("src/lib/admin/failures.ts");
    expect(failures).toContain('"record was" : "records were"');
    expect(failures).not.toContain("record${");
  });
});

describe("notices that read right", () => {
  const notify = read("src/lib/notifications/notify.ts");

  it("a test notice carries no actor and names nobody real", () => {
    const start = notify.indexOf("export async function sendTestNotice(");
    const test = notify.slice(start, notify.indexOf("\n}\n", start));
    expect(test).toContain("actorId: null,");
    const samples = notify.slice(
      notify.indexOf("export const TEST_NOTICES"),
      notify.indexOf("export type TestNoticeKind"),
    );
    expect(samples).not.toContain("CHUNC");
    expect(samples).toContain("Kaito has your Charizard");
  });

  it("the follower notice knows when this follow is the follow back", () => {
    const start = notify.indexOf("export async function notifyNewFollower(");
    const follower = notify.slice(start, notify.indexOf("\n}\n", start));
    expect(follower).toContain('.from("player_follows")');
    expect(follower).toContain('.eq("follower_id", followedId)');
    expect(follower).toContain('.eq("followed_id", followerId)');
    expect(follower).toContain(
      '"You follow each other now, so you\'re trade partners."',
    );
    expect(follower).toContain('"Follow back and you\'re trade partners."');
  });
});

describe("spot check shows a card's own game's fields", () => {
  it("keeps Counter, Life and Trigger to One Piece", () => {
    const row = read("src/components/admin/spot-check-row.tsx");
    expect(row).toContain('const onePiece = card.game === "one-piece";');
    for (const label of ['"Counter"', '"Life"', '"Trigger"']) {
      const at = row.indexOf(label);
      expect(at, label).toBeGreaterThan(0);
      expect(row.lastIndexOf("onePiece", at)).toBeGreaterThan(
        row.indexOf("const facts"),
      );
    }
    for (const label of ['"Type"', '"Colors"', '"Cost"', '"Power"', '"Rarity"']) {
      expect(row).toContain(label);
    }
  });
});

describe("addresses that go somewhere", () => {
  it("/poster on its own sends a store to its events", () => {
    expect(read("src/app/poster/page.tsx")).toContain('redirect("/store/events")');
  });

  it("a missing page wears the site, with a door to the Feed and home", () => {
    const page = read("src/app/not-found.tsx");
    expect(page).toContain("<Logo");
    expect(page).toContain('href="/feed"');
    expect(page).toContain('href="/"');
    expect(page).toContain("robots: { index: false, follow: false }");
  });

  it("a signed-in player opening /login lands on the Feed", () => {
    expect(signedInHome("player")).toBe("/feed");
    expect(signedInHome("store")).toBe("/store");
    expect(signedInHome("admin")).toBe("/store");
    expect(signedInHome("unaffiliated")).toBe("/store");
    const login = read("src/app/login/page.tsx");
    expect(login).toContain(
      "redirect(rawNext ? safeNextPath(rawNext) : signedInHome(viewer.kind));",
    );
  });
});
