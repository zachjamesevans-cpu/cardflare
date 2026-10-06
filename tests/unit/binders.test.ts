import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * Binders, round 2: any binder can be up for trade.
 *
 * The founder (2026-10-03): "Ability for multiple types of binders -
 * and a toggle to enable it as a public / trade binder. Anything that's
 * public is up for trade. IRL people will have a trade binder of bigger
 * cards, and sometimes a separate binder for things such as lower
 * dollar 'playables'."
 */

const lib = read("src/lib/binder/binder.ts");
const actions = read("src/lib/binder/actions.ts");
const migration = read("supabase/migrations/20261027090000_binders_for_trade.sql");

describe("every binder is one of the player's own", () => {
  it("has one switch, up for trade, and public means the same thing", () => {
    expect(migration).toContain(
      "add column if not exists for_trade boolean not null default false",
    );
    expect(migration).toContain("update public.binders set is_public = for_trade");
    expect(lib).toContain("isPublic: row.for_trade,");
    expect(lib).toContain("forTrade: row.for_trade,");
    /* Toggling writes both columns together. */
    expect(lib).toContain(
      "row.for_trade = patch.forTrade;\n    row.is_public = patch.forTrade;",
    );
    /* New binders are private unless the switch was on. */
    expect(lib).toContain("const forTrade = input.forTrade === true;");
  });

  it("knows no system Trade binder any more", () => {
    for (const source of [lib, actions]) {
      expect(source).not.toContain("TRADE_BINDER_ID");
      expect(source).not.toContain("kind:");
      expect(source).not.toContain("frontEntryId");
    }
    /* Every binder can be renamed and deleted. */
    expect(actions).not.toContain("The Trade binder stays.");
    expect(lib).toContain("export async function deleteBinder(");
    expect(lib).not.toMatch(/deleteBinder\([\s\S]{0,300}reason: "invalid"/);
  });

  it("pages are three by three, with no picker", () => {
    expect(lib).toContain("layout: DEFAULT_BINDER_LAYOUT,");
    expect(lib).not.toContain("patch.layout");
    expect(migration).toContain(
      "update public.binders set layout = 3 where layout <> 3",
    );
  });

  it("is listed in the owner's order; a visitor sees only those up for trade", () => {
    expect(lib).toContain("if (!yours && !row.for_trade) return null;");
    expect(lib).toContain('.order("position")');
    expect(lib).not.toContain("[trade, ...customs]");
  });
});

describe("the Have list is derived from the binders up for trade", () => {
  it("brings every existing Have list into a binder named Trade binder, up for trade", () => {
    expect(migration).toContain("'Trade binder'");
    expect(migration).toContain(
      "insert into public.binder_cards (binder_id, card_id, printing_id, quantity, note, position, created_at)",
    );
    expect(migration).toContain(
      "join public.player_sessions ps on ps.id = pc.player_session_id",
    );
    expect(migration).toContain("on conflict do nothing");
  });

  it("follows every write that could change it, card by card", () => {
    expect(lib).toContain("async function syncTradeCard(");
    /* Every card a batch touched, added or counted up. */
    const add = lib.slice(lib.indexOf("export async function addBinderCards("));
    expect(add).toMatch(
      /if \(row\.for_trade\) \{\s*for \(const item of touched\) \{\s*await syncTradeCard\(playerId, displayName, item\.cardId, item\.printingId\);/,
    );
    const remove = lib.slice(lib.indexOf("export async function removeBinderCard("));
    expect(remove).toMatch(
      /if \(row\.for_trade\)\s*await syncTradeCard\(\s*playerId,\s*displayName,\s*entry\.card_id,\s*entry\.printing_id,?\s*\)/,
    );
    const settings = lib.slice(
      lib.indexOf("export async function saveBinderSettings("),
    );
    expect(settings).toContain("patch.forTrade !== before.for_trade");
    expect(settings).toContain("syncTradeBinderCards(");
    const del = lib.slice(
      lib.indexOf("export async function deleteBinder("),
      lib.indexOf("export async function saveBinderSettings("),
    );
    expect(del).toContain("syncTradeBinderCards(playerId, displayName, cards)");
  });

  it("marks a held card available and looks for matches; takes an unheld one off the list", () => {
    const sync = lib.slice(
      lib.indexOf("async function syncTradeCard("),
      lib.indexOf("async function syncTradeBinderCards("),
    );
    expect(sync).toContain('.eq("for_trade", true)');
    expect(sync).toContain(".update({ local_trade: true, quantity })");
    expect(sync).toContain("void afterHolderChanged(playerId, cardId);");
    expect(sync).toContain("await removeFromBinder(entry.id, session.id);");
    /* Never an embed: the hand-kept types declare no relationships. */
    expect(sync).not.toContain("!inner");
  });

  it("is still what matching reads, untouched", () => {
    const matching = read("src/lib/nearby/matching.ts");
    expect(matching).toContain('.from("player_cards")');
    expect(matching).not.toContain("binder_cards");
  });
});

describe("every door names its binder by id", () => {
  it("on the actions", () => {
    for (const fn of [
      "saveBinderSettingsAction",
      "addBinderCardAction",
      "removeBinderCardAction",
      "reorderBinderAction",
    ]) {
      const body = actions.slice(actions.indexOf(`export async function ${fn}(`));
      expect(body.slice(0, 300), fn).toContain("binderId: string");
    }
    expect(actions).toContain("forTrade: z.boolean().optional()");
    expect(actions).toContain("export async function createBinderAction(");
    expect(actions).toContain("export async function deleteBinderAction(");
  });

  it("on the routes, with the old build's fields filled in and nothing new reading them", () => {
    const shared = read("src/app/api/v1/binders/_shared.ts");
    expect(shared).toContain("export const binderIdSchema = z.guid();");
    expect(shared).toContain("forTrade: z.boolean().optional()");
    expect(shared).toContain("export function forOldBuild<");
    for (const route of [
      "src/app/api/v1/binders/route.ts",
      "src/app/api/v1/binders/[binderId]/route.ts",
      "src/app/api/v1/binders/[binderId]/cards/route.ts",
      "src/app/api/v1/binders/[binderId]/order/route.ts",
      "src/app/api/players/[playerId]/binders/route.ts",
      "src/app/api/players/[playerId]/binders/[binderId]/route.ts",
      "src/app/api/players/[playerId]/route.ts",
      "src/app/api/v1/profile/route.ts",
    ]) {
      expect(read(route), route).toContain("forOldBuild");
    }
    /* The old build's "the trade binder" routes answer with the first one up for trade. */
    for (const route of [
      "src/app/api/v1/binder/route.ts",
      "src/app/api/v1/binder/cards/route.ts",
      "src/app/api/v1/binder/order/route.ts",
      "src/app/api/players/[playerId]/binder/route.ts",
    ]) {
      expect(read(route), route).toContain("firstTradeBinderId(");
    }
    const profile = read("src/lib/players/profile.ts");
    expect(profile).toContain("binders: BinderSummary[];");
    expect(profile).not.toContain("binder: BinderSummary | null");
  });
});
