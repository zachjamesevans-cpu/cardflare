import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * Search, the card page and Remove from hunt: the server half. The
 * lines these pin are the privacy lines, since a card page reads
 * everybody's lists by card instead of by person.
 */

describe("the card page", () => {
  const page = read("src/lib/cards/card-page.ts");

  it("lists holders from the Have list only, never a binder's rows", () => {
    expect(page).toContain('.from("player_cards")');
    expect(page).toContain('.eq("local_trade", true)');
    expect(page).not.toContain('from("binder_cards")');
    expect(page).not.toContain('from("binders")');
  });

  it("shows a distance only to a holder who opted in, and only the coarse label", () => {
    expect(page).toContain(
      "if (!viewer || !other?.point || !other.nearby) return null;",
    );
    expect(page).toContain("milesLabel(miles)");
    expect(page).not.toMatch(
      /latitude: row\.latitude,\s*longitude: row\.longitude[^}]*player/,
    );
  });

  it("lists hunters from open area Flares and public hunts, with what is still wanted", () => {
    expect(page).toContain('.eq("intent", "want")');
    expect(page).toContain('.is("event_id", null)');
    expect(page).toContain('.eq("visibility", "public")');
    expect(page).toContain('.is("removed_at", null)');
    expect(page).toContain("row.quantity_found < row.quantity_needed");
  });

  it("lists published stores with it in the case or the counter's singles, nearest first", () => {
    expect(page).toContain('.from("store_singles")');
    expect(page).toContain('.from("store_case_picks")');
    expect(page).toContain('.eq("listing_state", "published")');
    expect(page).toContain("inCase: caseStores.has(row.id)");
  });

  it("answers the app at its own address, signed out allowed", () => {
    const route = read("src/app/api/v1/cards/[cardId]/page/route.ts");
    expect(route).toContain("cardPage(id.data, account?.playerId ?? null)");
    expect(route).toContain("absoluteImageUrls(page)");
    expect(route).toContain("{ status: 404 }");
  });
});

describe("store search", () => {
  it("finds published shops by name or town, a few at a time", () => {
    const search = read("src/lib/stores/search.ts");
    expect(search).toContain('.eq("listing_state", "published")');
    expect(search).toContain("name.ilike.${like},city.ilike.${like}");
    expect(search).toContain("const LIMIT = 8;");
    expect(read("src/lib/stores/search-actions.ts")).toContain('"use server";');
    expect(read("src/app/api/v1/stores/search/route.ts")).toContain(
      "Response.json({ stores: await searchStores(query) })",
    );
  });
});

describe("taking a card off a hunt", () => {
  it("is a soft removal: the row stays, the live index ignores it, readers skip it", () => {
    const migration = read(
      "supabase/migrations/20261102090000_hunt_request_removed.sql",
    );
    expect(migration).toContain("add column if not exists removed_at timestamptz");
    expect(migration).toContain("where removed_at is null;");
    expect(read("src/lib/supabase/types.ts")).toContain("removed_at: string | null;");
    const hunts = read("src/lib/players/hunts.ts");
    expect(hunts).toContain("export async function removeHuntRequest(");
    expect(hunts).toContain(".update({ removed_at: now, updated_at: now })");
    expect(hunts).not.toMatch(/from\("hunt_requests"\)\s*\.delete\(/);
    expect(
      (hunts.match(/\.is\("removed_at", null\)/g) ?? []).length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("takes the card's open Flares down with it, owner only", () => {
    const hunts = read("src/lib/players/hunts.ts");
    const start = hunts.indexOf("export async function removeHuntRequest(");
    const body = hunts.slice(start, hunts.indexOf("\n}\n", start));
    expect(body).toContain('.eq("player_id", playerId)');
    expect(body).toContain('.eq("hunt_request_id", requestId)');
    expect(body).toContain('.eq("status", "open")');
    expect(body).toContain('status: "cancelled", withdrawn_at: now');
    expect(read("src/lib/players/hunt-actions.ts")).toContain(
      "export async function removeHuntCardAction(",
    );
    const route = read("src/app/api/v1/hunts/route.ts");
    expect(route).toContain('action: z.literal("remove-card")');
    expect(route).toContain("removeHuntRequest(player.playerId, body.requestId)");
  });
});
