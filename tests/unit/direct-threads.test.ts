import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

/**
 * Direct messages, and the three doors that open them.
 *
 * The founder (2026-10-01): "I should be able to go on someone's
 * profile and message them directly about anything", a green button
 * on "Wanted from you" that opens "I have <card>", and a hunt whose
 * every card can be answered. These pin the server's side of each.
 */
describe("a thread with no card", () => {
  const migration = read("supabase/migrations/20261019090000_direct_messages.sql");
  const lib = read("src/lib/local/threads.ts");
  const route = read("src/app/api/v1/local/threads/route.ts");

  it("is allowed by the schema, one per pair", () => {
    expect(migration).toContain("not (flare_id is not null and want_id is not null)");
    expect(migration).toContain("least(author_player_id, responder_player_id)");
    expect(migration).toContain("where flare_id is null and want_id is null");
  });

  it("opens from a player id, finds the pair either way round, and only a block refuses", () => {
    expect(lib).toContain("export async function openDirectThread(");
    expect(lib).toContain(
      "and(author_player_id.eq.${fromPlayerId},responder_player_id.eq.${toPlayerId}),and(author_player_id.eq.${toPlayerId},responder_player_id.eq.${fromPlayerId})",
    );
    expect(lib).not.toContain("existing?.closed_at");
    expect(lib).not.toContain("raced?.closed_at");
    const open = lib.slice(lib.indexOf("export async function openDirectThread("));
    expect(open.slice(0, 600)).toContain("blockedBetween(fromPlayerId, toPlayerId)");
  });

  it("is listed as a conversation only once somebody wrote in it", () => {
    expect(lib).toContain('kind: "flare" | "want" | "direct"');
    const list = lib.slice(lib.indexOf("export async function listThreads("));
    expect(list).toContain(
      "const last = latest.get(row.id);\n    if (!last) return [];",
    );
  });

  it("is reachable from the app's API by player id, with no first message", () => {
    expect(route).toContain("playerId: z.string().uuid().optional()");
    expect(route).toContain(
      "openDirectThread(player.playerId, playerId, { mayCreate })",
    );
  });
});

describe("Wanted from you", () => {
  const feed = read("src/lib/feed/repository.ts");

  it("shows accounts only, because the row's one action is a message", () => {
    expect(feed).toContain(
      "if (!person?.player_id || person.player_id === playerId) continue;",
    );
    expect(feed).toMatch(/playerId: string;\s+\/\*\* The Flare itself/);
  });

  it("forgets a want after a month", () => {
    expect(feed).toContain("const WANTED_WINDOW_DAYS = 30;");
    expect(feed).toContain('.gte("created_at", since.toISOString())');
  });

  it("carries the Flare and any thread already open on it", () => {
    expect(feed).toContain("flareId: flare.id,");
    expect(feed).toContain("threadId: threads.get(flare.id) ?? null,");
  });
});

describe("answering a hunt", () => {
  const offers = read("src/lib/players/hunt-offers.ts");
  const route = read("src/app/api/v1/hunts/[huntId]/route.ts");

  it("takes cards by request, so an unposted card can be answered", () => {
    expect(offers).toContain("requestId: string;");
    expect(offers).toContain("toMessage.push(");
  });

  it("offers on the post where there is one and messages the owner where there is not", () => {
    expect(offers).toMatch(
      /await offerItems\(\s*postId,\s*player\.id,\s*player\.displayName,\s*group,\s*note,?\s*\)/,
    );
    expect(offers).toContain("openDirectThread(player.id, hunt.player_id)");
    expect(offers).toContain("from your ${hunt.name} hunt.");
  });

  it("is one call from the app", () => {
    expect(route).toContain('action: z.literal("offer")');
    expect(route).toContain("offerOnHunt(");
  });
});
