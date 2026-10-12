import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Nearby matching, played out by people instead of scripted replies.
 *
 * The founder (2026-10-12): "it's hard to test that feature properly
 * without actual users so want to make sure". So this builds a small
 * world - players with ZIPs or without, wants, cards marked Trade
 * locally, blocks - in an in-memory database that really filters, and
 * runs the matching code against it. Each test is one person doing one
 * thing, and asks who the phone buzzes for.
 */

type Row = Record<string, unknown>;
const world: Record<string, Row[]> = {};
const pushes: { holderId: string; wanterId: string; milesLabel: string }[] = [];
const blocks: [string, string][] = [];
const updates: { table: string; values: Row; id: unknown }[] = [];

/* Just enough of supabase-js's builder, filtering for real. */
function query(table: string) {
  let rows = [...(world[table] ?? [])];
  let pendingUpdate: Row | null = null;
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
    or: () => builder,
    eq: (column: string, value: unknown) => {
      rows = rows.filter((row) => row[column] === value);
      return builder;
    },
    neq: (column: string, value: unknown) => {
      rows = rows.filter((row) => row[column] !== value);
      return builder;
    },
    in: (column: string, values: unknown[]) => {
      rows = rows.filter((row) => values.includes(row[column]));
      return builder;
    },
    is: (column: string, value: unknown) => {
      rows = rows.filter((row) => (row[column] ?? null) === value);
      return builder;
    },
    not: (column: string, _op: string, value: unknown) => {
      rows = rows.filter((row) => (row[column] ?? null) !== value);
      return builder;
    },
    limit: (count: number) => {
      rows = rows.slice(0, count);
      return builder;
    },
    update: (values: Row) => {
      pendingUpdate = values;
      return builder;
    },
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown) => {
      if (pendingUpdate) {
        for (const row of rows) {
          Object.assign(row, pendingUpdate);
          updates.push({ table, values: pendingUpdate, id: row.id });
        }
      }
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
  };
  return builder;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({ from: query }),
}));
vi.mock("@/lib/notifications/notify", () => ({
  notifyNearbyMatch: async (match: {
    holderId: string;
    wanterId: string;
    milesLabel: string;
  }) => {
    pushes.push({
      holderId: match.holderId,
      wanterId: match.wanterId,
      milesLabel: match.milesLabel,
    });
  },
}));
vi.mock("@/lib/players/accounts", () => ({
  sessionForPlayer: async (playerId: string) => ({ id: `session-${playerId}` }),
}));
vi.mock("@/lib/players/equips", () => ({ avatarWearFor: async () => new Map() }));
vi.mock("@/lib/players/safety", () => ({
  blockedSet: async (playerId: string) =>
    new Set(
      blocks.flatMap(([a, b]) => (a === playerId ? [b] : b === playerId ? [a] : [])),
    ),
}));
/* Run "after the response" work straight away, so a test can await it. */
const later: Promise<unknown>[] = [];
vi.mock("@/lib/after-response", () => ({
  afterResponse: (task: () => Promise<unknown>) => later.push(task()),
}));

const { afterWantSaved, afterLocationChanged, nearbyMatchesForHolder } =
  await import("@/lib/nearby/matching");
const { savePostalCodeFromPoint } = await import("@/lib/players/location");
const { withoutBlocked } = await import("@/lib/feed/blocks");

const CARD = "card-shanks";

/** A person. `zip` null is somebody who never gave one. */
function player(id: string, zip: string | null, options: Row = {}) {
  world.players.push({
    id,
    display_name: id,
    postal_code: zip,
    nearby_matching: true,
    local_radius_miles: 25,
    avatar_url: null,
    avatar_animated: null,
    tier: "free",
    equipped_avatar_frame: null,
    ...options,
  });
  world.player_sessions.push({ id: `session-${id}`, player_id: id });
}

function marksForTrade(id: string) {
  world.player_cards.push({
    id: `have-${id}`,
    player_session_id: `session-${id}`,
    card_id: CARD,
    printing_id: null,
    local_trade: true,
  });
}

function wants(id: string) {
  world.player_wants.push({
    id: `want-${id}`,
    player_id: id,
    card_id: CARD,
    printing_id: null,
  });
}

async function settle() {
  while (later.length) await later.shift();
}

beforeEach(() => {
  for (const table of [
    "players",
    "player_sessions",
    "player_cards",
    "player_wants",
    "flares",
    "flare_threads",
  ])
    world[table] = [];
  world.cards = [{ id: CARD, exact_name: "Shanks", canonical_card_number: "OP09-004" }];
  world.card_printings = [];
  pushes.length = 0;
  blocks.length = 0;
  updates.length = 0;
  later.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/* 10001 and 10011 are both Manhattan, about a mile apart. 07030 is
   Hoboken, a few miles. 19103 is Philadelphia, about 80. */
describe("somebody hunting a card, near somebody who has it", () => {
  it("buzzes the holder when both only typed a ZIP", async () => {
    player("holder", "10001");
    marksForTrade("holder");
    player("wanter", "10011");
    wants("wanter");

    await afterWantSaved("wanter", CARD);

    expect(pushes).toEqual([
      { holderId: "holder", wanterId: "wanter", milesLabel: "Under 2 mi away" },
    ]);
  });

  it("buzzes nobody when the wanter never said where they are", async () => {
    player("holder", "10001");
    marksForTrade("holder");
    player("wanter", null);
    wants("wanter");

    await afterWantSaved("wanter", CARD);
    expect(pushes).toEqual([]);
    expect(await nearbyMatchesForHolder("holder")).toEqual([]);
  });

  it("buzzes nobody when either of them turned nearby matching off", async () => {
    player("holder", "10001", { nearby_matching: false });
    marksForTrade("holder");
    player("wanter", "10011");
    wants("wanter");
    await afterWantSaved("wanter", CARD);

    player("holder2", "10001");
    marksForTrade("holder2");
    player("quiet", "10011", { nearby_matching: false });
    wants("quiet");
    await afterWantSaved("quiet", CARD);
    expect(pushes).toEqual([]);

    /* The same wanter again, now that a holder who opted in exists:
       only that holder, and never about the quiet one. */
    await afterWantSaved("wanter", CARD);
    expect(pushes.map((push) => [push.holderId, push.wanterId])).toEqual([
      ["holder2", "wanter"],
    ]);
    expect(
      (await nearbyMatchesForHolder("holder2")).map((m) => m.wanter.playerId),
    ).toEqual(["wanter"]);
  });

  it("buzzes nobody past the holder's radius, and does inside it", async () => {
    player("holder", "10001", { local_radius_miles: 50 });
    marksForTrade("holder");
    player("philly", "19103");
    wants("philly");
    player("hoboken", "07030");
    wants("hoboken");

    await afterWantSaved("philly", CARD);
    await afterWantSaved("hoboken", CARD);

    expect(pushes.map((push) => push.wanterId)).toEqual(["hoboken"]);
  });

  it("buzzes nobody about somebody blocked, whichever side blocked", async () => {
    player("holder", "10001");
    marksForTrade("holder");
    player("blocked", "10011");
    wants("blocked");
    player("blocker", "10011");
    wants("blocker");
    blocks.push(["holder", "blocked"], ["blocker", "holder"]);

    await afterWantSaved("blocked", CARD);
    await afterWantSaved("blocker", CARD);

    expect(pushes).toEqual([]);
    expect(await nearbyMatchesForHolder("holder")).toEqual([]);
  });

  it("finds somebody whose ZIP is a PO box", async () => {
    /* 00501 is Holtsville NY, a PO-box-only ZIP the Census table lacks;
       11742 is Holbrook next door. */
    player("holder", "11742");
    marksForTrade("holder");
    player("pobox", "00501");
    wants("pobox");

    await afterWantSaved("pobox", CARD);
    expect(pushes.map((push) => push.wanterId)).toEqual(["pobox"]);
  });

  it("never sends the exact distance, only what the label says", async () => {
    player("holder", "10001");
    marksForTrade("holder");
    player("near", "10011");
    wants("near");
    player("far", "07030");
    wants("far");

    const matches = await nearbyMatchesForHolder("holder");
    expect(matches.map((match) => match.miles)).toEqual([
      1,
      Math.round(matches[1].miles),
    ]);
    for (const match of matches) expect(Number.isInteger(match.miles)).toBe(true);
  });
});

describe("somebody who adds their location late", () => {
  it("buzzes the holders near them for what they were already hunting", async () => {
    player("holder", "10001");
    marksForTrade("holder");
    player("late", null);
    wants("late");

    await afterWantSaved("late", CARD);
    expect(pushes).toEqual([]);

    world.players.find((row) => row.id === "late")!.postal_code = "10011";
    await afterLocationChanged("late");

    expect(pushes.map((push) => push.wanterId)).toEqual(["late"]);
  });

  it("keeps only the ZIP when they tap Use my location, then matches from it", async () => {
    player("holder", "10001");
    marksForTrade("holder");
    player("phone", null);
    wants("phone");

    /* Somewhere on West 23rd Street. */
    const saved = await savePostalCodeFromPoint("phone", {
      latitude: 40.7448,
      longitude: -73.9967,
    });
    await settle();

    expect(saved.ok).toBe(true);
    expect(saved.postalCode).toMatch(/^100\d\d$/);
    /* The one write is five digits: no coordinate is kept anywhere. */
    expect(updates).toEqual([
      { table: "players", values: { postal_code: saved.postalCode }, id: "phone" },
    ]);
    expect(pushes.map((push) => push.wanterId)).toEqual(["phone"]);
  });

  it("refuses a position outside the US rather than inventing a ZIP", async () => {
    player("abroad", null);
    const saved = await savePostalCodeFromPoint("abroad", {
      latitude: 48.8566,
      longitude: 2.3522,
    });
    expect(saved.ok).toBe(false);
    expect(updates).toEqual([]);
  });
});

describe("the Feed's nearby card", () => {
  it("drops a match whose wanter is blocked", () => {
    const item = {
      kind: "nearbyMatch",
      matches: [
        { wanter: { playerId: "blocked" }, miles: 1 },
        { wanter: { playerId: "fine" }, miles: 3 },
      ],
    };
    expect(withoutBlocked(item, new Set(["blocked"]))).toEqual({
      kind: "nearbyMatch",
      matches: [{ wanter: { playerId: "fine" }, miles: 3 }],
    });
    expect(withoutBlocked(item, new Set(["blocked", "fine"]))).toBeNull();
  });
});

describe("the wiring nothing above can see", () => {
  const root = path.resolve(__dirname, "../..");
  const read = (file: string) => readFileSync(path.join(root, file), "utf8");

  it("sends every nearby ping after the response, never with a bare void", () => {
    for (const file of [
      "src/app/api/v1/haves/route.ts",
      "src/lib/binder/binder.ts",
      "src/lib/players/wants.ts",
      "src/lib/nearby/settings.ts",
      "src/lib/nearby/showcase.ts",
      "src/lib/local/area.ts",
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(
        /void (afterHolderChanged|afterWantSaved|keepShowcaseAsHave)\(/,
      );
      expect(source, file).toMatch(
        /afterResponse\(\(\) =>\s*(afterHolderChanged|afterWantSaved|keepShowcaseAsHave)/,
      );
    }
  });

  it("checks the block again right before the push, failing closed", () => {
    const notify = read("src/lib/notifications/notify.ts");
    const body = notify.slice(
      notify.indexOf("export async function notifyNearbyMatch"),
    );
    expect(
      body.indexOf("blockedBetween(match.holderId, match.wanterId)"),
    ).toBeGreaterThan(0);
    expect(body.indexOf("blockedBetween")).toBeLessThan(body.indexOf("await record("));
  });

  it("saves the phone's location as a ZIP from the app's nearby card only", () => {
    expect(read("mobile/src/nearby.tsx")).toMatch(/<NearbyLocationAsk[^>]*keepAsZip/);
    const ask = read("mobile/src/nearby-location-ask.tsx");
    expect(ask).toContain("savePostalCodeFromCoords(");
    expect(ask).toContain("keepAsZip = false");
  });

  it("scans from a newly saved ZIP", () => {
    expect(read("src/lib/players/location.ts")).toMatch(
      /if \(postalCode\) afterResponse\(\(\) => afterLocationChanged\(playerId\)\)/,
    );
  });
});
