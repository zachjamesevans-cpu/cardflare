import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The trade confirm's guards, against a scripted Supabase client — the same
 * harness as the offer repository, because it is the same threat model plus
 * one new stake: this write puts another player's name into history, so who
 * may write it and about whom matters more than anywhere else in the room.
 */

type Response = Record<string, unknown>;

function chain(response: Response, calls: Record<string, unknown[][]>) {
  const c: Record<string, unknown> = {};

  for (const method of [
    "select",
    "eq",
    "in",
    "or",
    "limit",
    "order",
    "update",
    "insert",
    "upsert",
    "delete",
  ]) {
    c[method] = vi.fn((...args: unknown[]) => {
      (calls[method] ??= []).push(args);
      return c;
    });
  }

  c.maybeSingle = () => Promise.resolve(response);
  c.then = (resolve: (v: Response) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(response).then(resolve, reject);

  return c;
}

const queues: Record<string, Response[]> = {};
const calls: Record<string, Record<string, unknown[][]>> = {};

function queue(table: string, ...responses: Response[]) {
  (queues[table] ??= []).push(...responses);
}

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const response = queues[table]?.shift() ?? { data: null, error: null };
      return chain(response, (calls[table] ??= {}));
    },
  }),
}));

const { confirmTrade, listMyTrades } = await import("@/lib/trades/repository");

const FLARE = {
  id: "flare-1",
  event_id: "event-1",
  player_session_id: "asker",
  card_id: "card-1",
  printing_id: "printing-alt",
  quantity: 2,
  status: "open",
};

beforeEach(() => {
  for (const store of [queues, calls]) {
    for (const key of Object.keys(store)) delete store[key];
  }
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("confirmTrade", () => {
  it("records the trade with the partner and closes the Flare", async () => {
    queue("flares", { data: FLARE, error: null }, { error: null }); // read, close
    queue("flare_responses", { data: { flare_id: "flare-1" }, error: null });
    queue("trades", { error: null });

    await expect(
      confirmTrade("flare-1", "event-1", "asker", "holder"),
    ).resolves.toEqual({ ok: true });

    // The snapshot is the Flare's terms, not the form's.
    expect(calls.trades.insert[0][0]).toMatchObject({
      event_id: "event-1",
      flare_id: "flare-1",
      requester_session_id: "asker",
      holder_session_id: "holder",
      card_id: "card-1",
      printing_id: "printing-alt",
      quantity: 2,
    });

    expect(calls.flares.update[0][0]).toMatchObject({ status: "traded" });
    // Closing is scoped to the owner as well as the id.
    expect(calls.flares.eq).toContainEqual(["player_session_id", "asker"]);
  });

  it("records a partnerless trade for someone who never tapped offer", async () => {
    queue("flares", { data: FLARE, error: null }, { error: null });
    queue("trades", { error: null });

    await expect(confirmTrade("flare-1", "event-1", "asker", null)).resolves.toEqual({
      ok: true,
    });

    expect(calls.trades.insert[0][0]).toMatchObject({ holder_session_id: null });
    // No partner named means no offer to verify — and no read of the table.
    expect(calls.flare_responses).toBeUndefined();
  });

  /*
   * The write that puts a name into history requires that name's owner to
   * have raised their hand. Without this, confirming would let one player
   * write another into a trade they never acknowledged.
   */
  it("refuses a partner who never offered", async () => {
    queue("flares", { data: FLARE, error: null });
    queue("flare_responses", { data: null, error: null });

    await expect(
      confirmTrade("flare-1", "event-1", "asker", "stranger"),
    ).resolves.toEqual({ ok: false, reason: "no-offer" });

    expect(calls.trades).toBeUndefined();
  });

  it("refuses yourself as the partner", async () => {
    queue("flares", { data: FLARE, error: null });

    await expect(confirmTrade("flare-1", "event-1", "asker", "asker")).resolves.toEqual(
      { ok: false, reason: "no-offer" },
    );
  });

  it.each([
    ["someone else's Flare", { player_session_id: "other" }],
    ["another room's Flare", { event_id: "event-2" }],
    ["a cancelled Flare", { status: "cancelled" }],
    ["an already-traded Flare", { status: "traded" }],
  ])("reads %s as not found", async (_label, overrides) => {
    queue("flares", { data: { ...FLARE, ...overrides }, error: null });

    await expect(confirmTrade("flare-1", "event-1", "asker", null)).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });

    expect(calls.trades).toBeUndefined();
    expect(calls.flares.update).toBeUndefined();
  });

  /*
   * The retry story: a confirm whose close never landed re-runs both writes.
   * The duplicate insert hits the one-trade-per-Flare index, and that must
   * read as "already recorded — go close the Flare", not as a failure.
   */
  it("treats a duplicate trade as already recorded and still closes", async () => {
    queue("flares", { data: FLARE, error: null }, { error: null });
    queue("trades", { error: { code: "23505", message: "duplicate" } });

    await expect(confirmTrade("flare-1", "event-1", "asker", null)).resolves.toEqual({
      ok: true,
    });

    expect(calls.flares.update).toHaveLength(1);
  });

  it("reports a failed close so the caller can retry", async () => {
    queue("flares", { data: FLARE, error: null }, { error: { message: "boom" } });
    queue("trades", { error: null });

    await expect(confirmTrade("flare-1", "event-1", "asker", null)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});

describe("listMyTrades", () => {
  it("labels each side and resolves the partner across it", async () => {
    queue("trades", {
      data: [
        {
          id: "t1",
          requester_session_id: "me",
          holder_session_id: "them",
          card_id: "card-1",
          quantity: 1,
          confirmed_at: "2026-08-10T20:00:00Z",
        },
        {
          id: "t2",
          requester_session_id: "them",
          holder_session_id: "me",
          card_id: "card-1",
          quantity: 3,
          confirmed_at: "2026-08-10T19:00:00Z",
        },
        {
          id: "t3",
          requester_session_id: "me",
          holder_session_id: null,
          card_id: "card-1",
          quantity: 1,
          confirmed_at: "2026-08-10T18:00:00Z",
        },
      ],
      error: null,
    });
    queue("cards", {
      data: [{ id: "card-1", exact_name: "Sanji", canonical_card_number: "OP01-013" }],
      error: null,
    });
    queue("player_sessions", {
      data: [{ id: "them", display_name: "Kaito" }],
      error: null,
    });

    const trades = await listMyTrades("event-1", "me");

    expect(trades).toHaveLength(3);
    expect(trades[0]).toMatchObject({
      youWere: "requester",
      partnerName: "Kaito",
      cardName: "Sanji",
    });
    expect(trades[1]).toMatchObject({ youWere: "holder", partnerName: "Kaito" });
    expect(trades[2]).toMatchObject({ youWere: "requester", partnerName: null });
  });
});
