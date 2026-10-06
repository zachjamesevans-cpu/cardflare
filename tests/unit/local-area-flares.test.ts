import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A Flare posted to an area rather than to a board.
 *
 * The rules worth holding, in the order they matter:
 *
 * 1. It is a POST, never a read of somebody's want list. The oldest rule
 *    in the product is that binders and saved lists stay private, and the
 *    whole reason this exists is to give a player a second place to
 *    deliberately be seen.
 * 2. It is anchored to the poster's own ZIP, never to a device
 *    coordinate — this row outlives the request that made it, and a
 *    precise position may not.
 * 3. No ZIP is an ASK, not an error. It is one field away from working.
 */

type Response = Record<string, unknown>;

const calls: { table: string; op: string; payload: unknown; filters: unknown[][] }[] =
  [];
let playerRow: Response = { data: { postal_code: "97477" }, error: null };
let insertResult: Response = { data: { id: "flare-1" }, error: null };
/* The probe that asks whether the migration has been applied. */
let schemaError: Response | null = null;
/* The cards this account already has open, for the batch's one read. */
let openRows: Record<string, unknown>[] = [];
/* Every table asked for, reads included. */
const froms: string[] = [];

function chain(table: string) {
  const c: Record<string, unknown> = {};
  let op = "select";
  const filters: unknown[][] = [];

  for (const method of ["select", "eq", "is", "in", "or", "limit", "order"]) {
    c[method] = vi.fn((...args: unknown[]) => {
      filters.push([method, ...args]);
      return c;
    });
  }
  for (const method of ["insert", "update", "delete"]) {
    c[method] = vi.fn((payload: unknown) => {
      op = method;
      calls.push({ table, op: method, payload, filters });
      return c;
    });
  }

  c.single = () => Promise.resolve(insertResult);
  c.maybeSingle = () => Promise.resolve(playerRow);
  c.then = (resolve: (v: Response) => unknown, reject: (e: unknown) => unknown) => {
    const last = calls[calls.length - 1];
    /* A batch insert: every row back with an id, unless the single
       insert's error is set, which the batch then hits too. */
    const batch =
      op === "insert" && last?.filters === filters && Array.isArray(last.payload)
        ? insertResult.error
          ? { data: null, error: insertResult.error }
          : {
              data: (last.payload as Record<string, unknown>[]).map((row, index) => ({
                id: `flare-${index + 1}`,
                card_id: row.card_id,
                printing_id: row.printing_id,
                intent: row.intent,
              })),
              error: null,
            }
        : null;
    return Promise.resolve(
      batch ??
        (op === "update"
          ? { error: null }
          : table === "flares" && schemaError
            ? schemaError
            : table === "flares" && op === "select"
              ? { data: openRows, error: null }
              : { data: null, error: null }),
    ).then(resolve, reject);
  };

  return c;
}

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      froms.push(table);
      return chain(table);
    },
  }),
}));

/* The fire-and-forget follow-ups do their own reads; they are not the
   post, and counting their queries would hide the post's own. */
vi.mock("@/lib/nearby/matching", () => ({ afterWantSaved: vi.fn() }));
vi.mock("@/lib/nearby/showcase", () => ({ keepShowcaseAsHave: vi.fn() }));

const { postAreaFlare, postAreaFlares, withdrawAreaFlare } =
  await import("@/lib/local/area");

beforeEach(() => {
  calls.length = 0;
  playerRow = { data: { postal_code: "97477" }, error: null };
  insertResult = { data: { id: "flare-1" }, error: null };
  schemaError = null;
  openRows = [];
  froms.length = 0;
});

const inserted = () =>
  calls.find((c) => c.op === "insert")?.payload as Record<string, unknown>;

describe("posting a Flare to your area", () => {
  it("anchors it to the poster's own ZIP", async () => {
    const result = await postAreaFlare("player-1", { cardId: "card-1" });

    expect(result).toEqual({ ok: true, flareId: "flare-1" });
    expect(inserted()).toMatchObject({
      player_id: "player-1",
      posted_postal_code: "97477",
    });
  });

  it("belongs to no board, which is the whole point", async () => {
    await postAreaFlare("player-1", { cardId: "card-1" });

    /* The database check refuses a row with both shapes or neither, so
       these two nulls are not decoration. */
    expect(inserted()).toMatchObject({ event_id: null, player_session_id: null });
  });

  /* Local is off and a Flare with no room goes to friends, so a
     missing ZIP is not a wall: the founder, "No need to have that
     requirement now because it just shows your flares to your friends
     in the feed." */
  it("posts without a ZIP when there is none", async () => {
    playerRow = { data: { postal_code: null }, error: null };

    expect(await postAreaFlare("player-1", { cardId: "card-1" })).toEqual({
      ok: true,
      flareId: "flare-1",
    });
    expect(inserted()).toMatchObject({
      posted_postal_code: null,
      player_id: "player-1",
    });
  });

  it("treats a ZIP+4 and stray spacing as the five digits they are", async () => {
    playerRow = { data: { postal_code: "  97477-1234 " }, error: null };

    await postAreaFlare("player-1", { cardId: "card-1" });

    expect(inserted()).toMatchObject({ posted_postal_code: "97477" });
  });

  it("writes no ZIP rather than a malformed one", async () => {
    playerRow = { data: { postal_code: "SW1A 1AA" }, error: null };

    expect(await postAreaFlare("player-1", { cardId: "card-1" })).toEqual({
      ok: true,
      flareId: "flare-1",
    });
    expect(inserted()).toMatchObject({ posted_postal_code: null });
  });

  it("says the card is already up rather than reporting a database error", async () => {
    insertResult = { data: null, error: { code: "23505", message: "duplicate key" } };

    expect(await postAreaFlare("player-1", { cardId: "card-1" })).toEqual({
      ok: false,
      reason: "already-posted",
    });
  });

  it("defaults to hunting, one copy, open to a trade", async () => {
    await postAreaFlare("player-1", { cardId: "card-1" });

    expect(inserted()).toMatchObject({
      intent: "want",
      quantity: 1,
      accepts_trade: true,
      accepts_cash: false,
      printing_id: null,
    });
  });

  it("carries a showcase and cash terms through when asked", async () => {
    await postAreaFlare("player-1", {
      cardId: "card-1",
      printingId: "printing-9",
      intent: "showcase",
      acceptsCash: true,
      quantity: 3,
      note: "Meeting at the shop Friday",
    });

    expect(inserted()).toMatchObject({
      intent: "showcase",
      printing_id: "printing-9",
      accepts_cash: true,
      quantity: 3,
      note: "Meeting at the shop Friday",
    });
  });

  it("never carries a deck label or a batch, which belong to a board", async () => {
    await postAreaFlare("player-1", { cardId: "card-1" });

    /* A lone post is a batch of ONE: the column is NOT NULL, so the row
       carries its own fresh id rather than nothing. */
    expect(inserted()).toMatchObject({ deck_label: null });
    expect(typeof (inserted() as { posted_batch?: unknown }).posted_batch).toBe(
      "string",
    );
  });
});

describe("taking one down", () => {
  it("cancels rather than deletes, so a thread about it still reads", async () => {
    await withdrawAreaFlare("player-1", "flare-1");

    const update = calls.find((c) => c.op === "update");
    expect(update?.payload).toEqual({ status: "cancelled" });
  });

  it("can only touch your own, and only an area Flare", async () => {
    await withdrawAreaFlare("player-1", "flare-1");

    const update = calls.find((c) => c.op === "update");
    expect(update?.filters).toEqual(
      expect.arrayContaining([
        ["eq", "id", "flare-1"],
        ["eq", "player_id", "player-1"],
        ["is", "event_id", null],
      ]),
    );
  });
});

describe("posting with a location instead of a typed ZIP", () => {
  /*
   * The bug this block exists for, reported from the live site: "it
   * doesn't let me click anything and tells me i need to put in a zip,
   * despite it already knowing my location after i approved it."
   *
   * Local accepts EITHER a device coordinate or the profile's ZIP as an
   * origin. Posting accepted only the ZIP, so granting the browser the
   * more precise thing left the composer permanently refusing — and
   * every tap produced the identical sentence, which reads as a screen
   * that does not respond at all.
   */
  it("anchors to the coordinate when the profile has no ZIP", async () => {
    playerRow = { data: { postal_code: null }, error: null };

    const result = await postAreaFlare(
      "player-1",
      { cardId: "card-1" },
      /* Eugene, Oregon. */
      { latitude: 44.0521, longitude: -123.0868 },
    );

    expect(result).toEqual({ ok: true, flareId: "flare-1" });
    /* Snapped to a centroid: five digits, never the position shared. */
    expect(inserted()).toMatchObject({ posted_postal_code: "97401" });
  });

  it("stores five digits, never the coordinate it was given", async () => {
    playerRow = { data: { postal_code: null }, error: null };

    await postAreaFlare(
      "player-1",
      { cardId: "card-1" },
      { latitude: 44.0521, longitude: -123.0868 },
    );

    const row = inserted();
    expect(row).not.toHaveProperty("latitude");
    expect(row).not.toHaveProperty("longitude");
    expect(String(row.posted_postal_code)).toMatch(/^[0-9]{5}$/);
  });

  it("still prefers the ZIP somebody typed", async () => {
    playerRow = { data: { postal_code: "97477" }, error: null };

    await postAreaFlare(
      "player-1",
      { cardId: "card-1" },
      { latitude: 44.0521, longitude: -123.0868 },
    );

    expect(inserted()).toMatchObject({ posted_postal_code: "97477" });
  });

  it("still posts, unanchored, when there is neither", async () => {
    playerRow = { data: { postal_code: null }, error: null };

    expect(await postAreaFlare("player-1", { cardId: "card-1" }, null)).toEqual({
      ok: true,
      flareId: "flare-1",
    });
    expect(inserted()).toMatchObject({ posted_postal_code: null });
  });

  it("leaves a coordinate nowhere near a ZIP unanchored rather than snapping to nonsense", async () => {
    playerRow = { data: { postal_code: null }, error: null };

    /* The middle of the Atlantic. The nearest ZCTA is a real row and a
       ridiculous answer. */
    expect(
      await postAreaFlare(
        "player-1",
        { cardId: "card-1" },
        { latitude: 30, longitude: -40 },
      ),
    ).toEqual({ ok: true, flareId: "flare-1" });
    expect(inserted()).toMatchObject({ posted_postal_code: null });
  });
});

describe("when the migration has not been applied", () => {
  /*
   * Deploying the app and applying the migrations are two acts in this
   * project and nothing runs the second one automatically. Before this,
   * that window produced a not-null violation on `event_id`, an honest
   * 500, and the words "Could not post that" on somebody's phone — which
   * sends whoever reads it hunting for a bug in a client that did
   * everything right.
   */
  it("says so instead of shrugging", async () => {
    schemaError = {
      data: null,
      error: { code: "42703", message: "column flares.player_id does not exist" },
    };

    expect(await postAreaFlare("player-1", { cardId: "card-1" })).toEqual({
      ok: false,
      reason: "not-migrated",
    });
  });

  it("does not attempt the insert at all", async () => {
    schemaError = {
      data: null,
      error: { code: "42703", message: "column flares.player_id does not exist" },
    };

    await postAreaFlare("player-1", { cardId: "card-1" });

    expect(calls.find((c) => c.op === "insert")).toBeUndefined();
  });

  it("names a not-null event_id as the same cause", async () => {
    insertResult = {
      data: null,
      error: { code: "23502", message: 'null value in column "event_id"' },
    };

    expect(await postAreaFlare("player-1", { cardId: "card-1" })).toEqual({
      ok: false,
      reason: "not-migrated",
    });
  });
});

describe("posting several cards as one thing", () => {
  /*
   * The founder: "should be able to post multiple flares in one group in
   * local — so it looks like one post." A room's board has done this
   * since `posted_batch` arrived; Local was one card at a time, so
   * building a deck there scrolled thirty separate posts past everybody
   * nearby.
   */
  const inserts = () => calls.filter((c) => c.op === "insert");
  /* Every row written, whether one insert carried them or several. */
  const rows = () =>
    inserts().flatMap((c) =>
      Array.isArray(c.payload)
        ? (c.payload as Record<string, unknown>[])
        : [c.payload as Record<string, unknown>],
    );
  const lookups = (table: string) => froms.filter((name) => name === table);

  it("gives every card the same batch, which is the whole mechanism", async () => {
    await postAreaFlares("player-1", [
      { cardId: "card-1" },
      { cardId: "card-2" },
      { cardId: "card-3" },
    ]);

    const batches = rows().map((row) => row.posted_batch);

    expect(batches).toHaveLength(3);
    expect(new Set(batches).size).toBe(1);
    expect(batches[0]).toEqual(expect.any(String));
  });

  it("carries the group's name onto each row", async () => {
    await postAreaFlares(
      "player-1",
      [{ cardId: "card-1" }, { cardId: "card-2" }],
      null,
      "Red Zoro",
    );

    for (const row of rows()) {
      expect(row).toMatchObject({ deck_label: "Red Zoro" });
    }
  });

  it("reports how many went up", async () => {
    const result = await postAreaFlares("player-1", [
      { cardId: "card-1" },
      { cardId: "card-2" },
    ]);

    expect(result).toMatchObject({ ok: true, posted: 2, alreadyUp: 0, failed: 0 });
  });

  /*
   * The audit: a thirty-card paste was ninety sequential queries (the
   * schema probe, the ZIP and an insert, per card) and could outlive the
   * function. One insert carries the lot now.
   */
  it("writes the whole deck in ONE insert, not one per card", async () => {
    await postAreaFlares(
      "player-1",
      Array.from({ length: 30 }, (_, index) => ({ cardId: `card-${index}` })),
    );

    expect(inserts()).toHaveLength(1);
    expect(rows()).toHaveLength(30);
  });

  it("reads the player's ZIP once per post, not once per card", async () => {
    await postAreaFlares(
      "player-1",
      Array.from({ length: 12 }, (_, index) => ({ cardId: `card-${index}` })),
    );

    expect(lookups("players")).toHaveLength(1);
    /* And the schema probe once, not per card: probe, open read, insert. */
    expect(lookups("flares")).toHaveLength(3);
  });

  it("counts a card already up as skipped, and posts the rest", async () => {
    openRows = [{ card_id: "card-2", printing_id: null, intent: "want" }];

    const result = await postAreaFlares("player-1", [
      { cardId: "card-1" },
      { cardId: "card-2" },
      { cardId: "card-3" },
    ]);

    expect(result).toMatchObject({ ok: true, posted: 2, alreadyUp: 1, failed: 0 });
    expect(rows().map((row) => row.card_id)).toEqual(["card-1", "card-3"]);
  });

  it("says already up, not unavailable, when every card was", async () => {
    openRows = [
      { card_id: "card-1", printing_id: null, intent: "want" },
      { card_id: "card-2", printing_id: null, intent: "want" },
    ];

    expect(
      await postAreaFlares("player-1", [{ cardId: "card-1" }, { cardId: "card-2" }]),
    ).toEqual({ ok: false, reason: "already-posted" });
    expect(inserts()).toHaveLength(0);
  });

  it("stops on a wall every remaining card would hit too", async () => {
    /* A missing migration is not a per-card problem; grinding through
       thirty writes to prove it would be thirty pointless failures. */
    insertResult = { data: null, error: { code: "23514", message: "check violated" } };

    expect(
      await postAreaFlares("player-1", [{ cardId: "card-1" }, { cardId: "card-2" }]),
    ).toEqual({ ok: false, reason: "not-migrated" });
    expect(inserts()).toHaveLength(1);
  });

  it("leaves a lone card ungrouped, so one card is not a folder", async () => {
    await postAreaFlare("player-1", { cardId: "card-1" });

    /* A lone post is a batch of ONE: the column is NOT NULL, so the row
       carries its own fresh id rather than nothing. */
    expect(inserted()).toMatchObject({ deck_label: null });
    expect(typeof (inserted() as { posted_batch?: unknown }).posted_batch).toBe(
      "string",
    );
  });
});
