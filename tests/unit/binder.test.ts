import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  BINDER_COVERS,
  binderCountLine,
  binderCover,
  binderMatchLine,
  DEFAULT_BINDER_COVER,
  isBinderCover,
  isBinderLayout,
  pocketsPerPage,
} from "@/lib/binder/covers";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * The trade binder, round 1: the Have list made public by choice.
 *
 * The founder (2026-10-02): "add cards you are open to trading. can
 * click on someone's profile and see their trade binder", and then
 * "build a basic version of it first with a few simple color change
 * options, no animated stuff yet."
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

  it("knows the two binders people own", () => {
    expect(isBinderLayout(2)).toBe(true);
    expect(isBinderLayout(3)).toBe(true);
    expect(isBinderLayout(4)).toBe(false);
    expect(pocketsPerPage(2)).toBe(4);
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

describe("the binder is the Have list with a switch", () => {
  const lib = read("src/lib/binder/binder.ts");
  const migration = read("supabase/migrations/20261024090000_trade_binder.sql");

  it("stores settings only, never a second list of cards", () => {
    expect(migration).toContain("create table public.player_binders");
    expect(migration).toContain("is_public boolean not null default false");
    expect(migration).toContain("layout in (2, 3)");
    expect(migration).toContain(
      "references public.player_cards (id) on delete set null",
    );
    expect(migration).not.toMatch(/create table public\.binder_cards/);
    /* The cards come from the Have list's own reader. */
    expect(lib).toContain("listHaves(ownerId)");
    expect(lib).toContain("addToBinder(session.id");
    expect(lib).toContain("removeFromBinder(entryId, session.id)");
  });

  it("opens only when public, or to its owner", () => {
    expect(lib).toContain("if (!yours && !settings.isPublic) return null;");
    /* Public by default since the profile redesign: the founder, "Be
       public to users in the relevant CardFlare Room / local trading
       context". The migration default and the lib default agree. */
    expect(lib).toMatch(/isPublic: true,\s*layout: DEFAULT_BINDER_LAYOUT/);
  });

  it("never asks the owner whether they want their own cards", () => {
    expect(lib).toContain(
      "yours ? Promise.resolve(new Set<string>()) : wantedCardIds(viewerId)",
    );
  });

  it("falls back to the newest card when the front card is gone", () => {
    expect(lib).toContain("(cards[0]?.entryId ?? null)");
  });

  it("rides on every profile read, for whoever is looking", () => {
    const profile = read("src/lib/players/profile.ts");
    expect(profile).toContain("binder: BinderSummary | null;");
    expect(profile).toContain("binderSummary(playerId, viewerId)");
    expect(profile).toMatch(
      /export async function publicProfile\(\s*playerId: string,\s*[\s\S]*?viewerId: string \| null = null/,
    );
  });

  it("reaches the app through its own routes and the profile", () => {
    const own = read("src/app/api/v1/binder/route.ts");
    const cards = read("src/app/api/v1/binder/cards/route.ts");
    const theirs = read("src/app/api/players/[playerId]/binder/route.ts");
    expect(own).toContain("export async function GET");
    expect(own).toContain("export async function PATCH");
    expect(cards).toContain("export async function POST");
    expect(cards).toContain("export async function DELETE");
    expect(cards).toContain('result.reason === "at-cap" ? 409 : 503');
    expect(theirs).toContain('{ error: "private" }, { status: 404 }');
    expect(theirs).toContain("mayLook(request)");
    for (const route of [own, cards, theirs])
      expect(route).toContain("absoluteImageUrls(");
    expect(read("src/app/api/players/[playerId]/route.ts")).toContain(
      "publicProfile(playerId, me)",
    );
    expect(read("src/app/api/v1/profile/route.ts")).toContain(
      "binder: absoluteImageUrls(profile.binder)",
    );
    /* The front picture is a URL the app has to be able to fetch. */
    expect(read("src/lib/api/absolute.ts")).toContain('key === "frontImageUrl"');
  });
});

describe("the binder's order is the owner's", () => {
  const lib = read("src/lib/binder/binder.ts");

  it("keeps a pocket per card on the Have list row itself", () => {
    const migration = read("supabase/migrations/20261025090000_binder_order.sql");
    expect(migration).toContain("alter table public.player_cards");
    expect(migration).toContain("add column if not exists position integer");
    expect(read("src/lib/lists/repository.ts")).toContain(
      "position: row.position ?? null",
    );
  });

  it("puts a card that has no pocket yet first, newest first", () => {
    expect(lib).toContain("if (a.position === null) return -1;");
    expect(lib).toContain("return b.createdAt.localeCompare(a.createdAt);");
  });

  it("never loses a card a stale screen left out of the order", () => {
    expect(lib).toContain("export async function saveBinderOrder(");
    expect(lib).toContain("const order = [...placed, ...rest];");
    expect(lib).toContain('.eq("player_session_id", session.id)');
  });

  it("is written from the website and the app alike", () => {
    expect(read("src/lib/binder/actions.ts")).toContain(
      "export async function reorderBinderAction(",
    );
    const route = read("src/app/api/v1/binder/order/route.ts");
    expect(route).toContain("export async function PUT");
    expect(route).toContain("saveBinderOrder(player.playerId, parsed.data.entryIds)");
  });
});
