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
      op === "update" ? { error: null } : { data: null, error: null },
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
