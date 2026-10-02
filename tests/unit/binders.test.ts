import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * Two kinds of binder, deliberately apart.
 *
 * The founder's profile redesign: "Introduce or formalize one special
 * system binder: 'Trade Binder'... Cards inside the Trade Binder
 * represent cards the user is actively willing to trade." and "Other
 * binders should act more like collection folders / showcases... These
 * should NOT automatically participate in nearby trade matching."
 */

const lib = read("src/lib/binder/binder.ts");
const migration = read("supabase/migrations/20261026090000_custom_binders.sql");

describe("the Trade binder is the Have list", () => {
  it("reads and writes player_cards, and nothing of its own", () => {
    expect(lib).toContain('export const TRADE_BINDER_ID = "trade"');
    expect(lib).toContain('export const TRADE_BINDER_NAME = "Trade binder"');
    expect(lib).toContain("listHaves(ownerId)");
    expect(lib).toContain("addToBinder(session.id");
    expect(lib).toContain("removeFromBinder(entryId, session.id)");
  });

  it("marks every card it takes as available to trade, and looks for matches at once", () => {
    const add = lib.slice(lib.indexOf("export async function addBinderCard("));
    expect(add).toContain(".update({ local_trade: true })");
    expect(add).toContain("void afterHolderChanged(playerId, input.cardId)");
    /* The old per-card toggle is gone, so the rows are brought up to date. */
    expect(migration).toContain(
      "update public.player_cards set local_trade = true where local_trade = false;",
    );
  });

  it("is public to signed-in players unless its owner says otherwise", () => {
    expect(migration).toContain("alter column is_public set default true");
    expect(lib).toMatch(/const DEFAULT_SETTINGS: Settings = \{\s*isPublic: true/);
  });

  it("cannot be renamed or deleted", () => {
    expect(lib).toContain(
      'if (binderId === TRADE_BINDER_ID) return { ok: false, reason: "invalid" };',
    );
    expect(read("src/lib/binder/actions.ts")).toContain('"The Trade binder stays."');
  });
});

describe("custom binders are their own rows", () => {
  it("live in binders and binder_cards, never in player_cards", () => {
    expect(migration).toContain("create table public.binders (");
    expect(migration).toContain("create table public.binder_cards (");
    expect(migration).toContain(
      "binders_name_length check (char_length(name) between 1 and 40)",
    );
    expect(migration).toContain("is_public boolean not null default true");
    const custom = lib.slice(lib.indexOf("async function readCustomBinder("));
    expect(custom).toContain('.from("binder_cards")');
    expect(custom).not.toContain("listHaves(");
  });

  it("take no part in matching", () => {
    const customAdd = lib.slice(
      lib.indexOf('.from("binder_cards").insert('),
      lib.indexOf("export async function removeBinderCard("),
    );
    expect(customAdd).not.toContain("afterHolderChanged");
    expect(customAdd).not.toContain("local_trade");
    expect(read("src/lib/nearby/matching.ts")).not.toContain("binder_cards");
  });

  it("are capped, named, and listed after the Trade binder", () => {
    expect(lib).toContain("export const MAX_CUSTOM_BINDERS = 20");
    expect(lib).toContain("export const MAX_CUSTOM_BINDER_CARDS = 200");
    expect(lib).toContain("export const BINDER_NAME_MAX = 40");
    expect(lib).toContain("return [trade, ...customs].flatMap(");
  });
});

describe("every door opens by binder id", () => {
  it("defaults to the Trade binder on the lib and the actions", () => {
    for (const fn of [
      "readBinder",
      "saveBinderSettings",
      "addBinderCard",
      "removeBinderCard",
      "saveBinderOrder",
    ]) {
      const body = lib.slice(lib.indexOf(`export async function ${fn}(`));
      expect(body.slice(0, 400), fn).toContain("binderId: string = TRADE_BINDER_ID");
    }
    const actions = read("src/lib/binder/actions.ts");
    expect(actions).toContain("export async function createBinderAction(");
    expect(actions).toContain("export async function deleteBinderAction(");
    expect(actions).toContain("if (binderId === undefined) return TRADE_BINDER_ID;");
  });

  it("reaches the app through /api/v1/binders and the profile", () => {
    expect(read("src/app/api/v1/binders/route.ts")).toContain(
      "export async function POST",
    );
    const one = read("src/app/api/v1/binders/[binderId]/route.ts");
    for (const verb of ["GET", "PATCH", "DELETE"])
      expect(one).toContain(`export async function ${verb}`);
    const cards = read("src/app/api/v1/binders/[binderId]/cards/route.ts");
    expect(cards).toContain("export async function POST");
    expect(cards).toContain("export async function DELETE");
    expect(read("src/app/api/v1/binders/[binderId]/order/route.ts")).toContain(
      "export async function PUT",
    );
    expect(read("src/app/api/players/[playerId]/binders/route.ts")).toContain(
      "listBinders(playerId, me)",
    );
    expect(
      read("src/app/api/players/[playerId]/binders/[binderId]/route.ts"),
    ).toContain('{ error: "private" }, { status: 404 }');
    /* The old routes stay for the app build in people's pockets. */
    expect(read("src/app/api/v1/binder/route.ts")).toContain(
      "export async function GET",
    );
    const profile = read("src/lib/players/profile.ts");
    expect(profile).toContain("binders: BinderSummary[];");
    expect(profile).toContain("flares: ProfileFlare[];");
    for (const route of [
      "src/app/api/players/[playerId]/route.ts",
      "src/app/api/v1/profile/route.ts",
    ]) {
      expect(read(route)).toContain("binders: absoluteImageUrls(profile.binders)");
      expect(read(route)).toContain("flares: absoluteImageUrls(profile.flares)");
    }
  });
});
