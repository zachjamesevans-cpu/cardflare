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
  c.then = (resolve: (v: Response) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(
      op === "update"
        ? { error: null }
        : table === "flares" && schemaError
          ? schemaError
          : { data: null, error: null },
    ).then(resolve, reject);

  return c;
}

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({ from: (table: string) => chain(table) }),
}));

const { postAreaFlare, withdrawAreaFlare } = await import("@/lib/local/area");

beforeEach(() => {
  calls.length = 0;
  playerRow = { data: { postal_code: "97477" }, error: null };
  insertResult = { data: { id: "flare-1" }, error: null };
  schemaError = null;
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

  it("asks for a ZIP rather than failing when there is none", async () => {
    playerRow = { data: { postal_code: null }, error: null };

    expect(await postAreaFlare("player-1", { cardId: "card-1" })).toEqual({
      ok: false,
      reason: "no-postal-code",
    });
    expect(calls.find((c) => c.op === "insert")).toBeUndefined();
  });

  it("treats a ZIP+4 and stray spacing as the five digits they are", async () => {
    playerRow = { data: { postal_code: "  97477-1234 " }, error: null };

    await postAreaFlare("player-1", { cardId: "card-1" });

    expect(inserted()).toMatchObject({ posted_postal_code: "97477" });
  });

  it("refuses a postal code that is not five digits", async () => {
    playerRow = { data: { postal_code: "SW1A 1AA" }, error: null };

    expect(await postAreaFlare("player-1", { cardId: "card-1" })).toEqual({
      ok: false,
      reason: "no-postal-code",
    });
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

    expect(inserted()).toMatchObject({ posted_batch: null, deck_label: null });
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

  it("still asks when there is neither", async () => {
    playerRow = { data: { postal_code: null }, error: null };

    expect(await postAreaFlare("player-1", { cardId: "card-1" }, null)).toEqual({
      ok: false,
      reason: "no-postal-code",
    });
  });

  it("refuses a coordinate nowhere near a ZIP rather than snapping to nonsense", async () => {
    playerRow = { data: { postal_code: null }, error: null };

    /* The middle of the Atlantic. The nearest ZCTA is a real row and a
       ridiculous answer. */
    expect(
      await postAreaFlare(
        "player-1",
        { cardId: "card-1" },
        { latitude: 30, longitude: -40 },
      ),
    ).toEqual({ ok: false, reason: "no-postal-code" });
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
