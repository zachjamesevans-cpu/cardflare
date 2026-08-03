import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The offer write path's guards, against a scripted Supabase client.
 *
 * The offer button only renders on a match, but a Server Action is a public
 * POST endpoint, so these rules live server-side and each one is pinned here:
 * an id from another room does nothing, you cannot offer on your own Flare,
 * and you cannot put your name on a Flare for a card you do not carry —
 * which is what would turn offers into a spam channel.
 */

type Response = Record<string, unknown>;

/** Chainable query stub: any builder method returns itself; awaiting it (or
 * calling a terminal) resolves the canned response queued for its table. */
function chain(response: Response, calls: Record<string, unknown[][]>) {
  const c: Record<string, unknown> = {};

  for (const method of [
    "select",
    "eq",
    "in",
    "is",
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
  c.single = () => Promise.resolve(response);
  c.then = (resolve: (v: Response) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(response).then(resolve, reject);

  return c;
}

/** Per-table FIFO of responses, plus a per-table log of builder calls. */
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

const { offerTrade, withdrawOffer, listRoomOffers } =
  await import("@/lib/matching/repository");

const FLARE = {
  id: "flare-1",
  event_id: "event-1",
  player_session_id: "asker",
  card_id: "card-1",
  status: "open",
};

function offer(overrides: Partial<typeof FLARE> = {}) {
  queue("flares", { data: { ...FLARE, ...overrides }, error: null });
  return offerTrade("flare-1", "event-1", "holder", "table 12");
}

beforeEach(() => {
  for (const store of [queues, calls]) {
    for (const key of Object.keys(store)) delete store[key];
  }
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("offerTrade", () => {
  it("records an offer from a holder who carries the card", async () => {
    queue("player_cards", { data: [{ id: "pc-1" }], error: null });
    queue("flare_responses", { data: [], error: null }); // cap count
    queue("flare_responses", { error: null }); // upsert

    await expect(offer()).resolves.toEqual({ ok: true });

    expect(calls.flare_responses.upsert?.[0]?.[0]).toMatchObject({
      flare_id: "flare-1",
      responder_session_id: "holder",
      message: "table 12",
    });
    // Offering twice must update the message, never stack a second row.
    expect(calls.flare_responses.upsert?.[0]?.[1]).toMatchObject({
      onConflict: "flare_id,responder_session_id",
    });
  });

  it.each([
    ["a Flare from another room", { event_id: "event-2" }],
    ["a cancelled Flare", { status: "cancelled" }],
  ])("refuses %s", async (_label, overrides) => {
    await expect(offer(overrides)).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(calls.flare_responses?.upsert).toBeUndefined();
  });

  it("refuses a Flare that does not exist", async () => {
    queue("flares", { data: null, error: null });

    await expect(offerTrade("flare-1", "event-1", "holder", null)).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("refuses your own Flare", async () => {
    await expect(offer({ player_session_id: "holder" })).resolves.toEqual({
      ok: false,
      reason: "own-flare",
    });
  });

  /*
   * The rule that keeps offers meaning something: your name only goes on a
   * Flare when your binder says you carry the card.
   */
  it("refuses a holder whose binder lacks the card", async () => {
    queue("player_cards", { data: [], error: null });

    await expect(offer()).resolves.toEqual({ ok: false, reason: "not-held" });
    expect(calls.flare_responses?.upsert).toBeUndefined();
  });

  it("stops at the cap of open offers in this room", async () => {
    // The flares queue serves the lookup first, then the cap count.
    queue("flares", { data: FLARE, error: null }, { count: 30, error: null });
    queue("player_cards", { data: [{ id: "pc-1" }], error: null });
    queue("flare_responses", {
      data: Array.from({ length: 30 }, (_, i) => ({ flare_id: `f${i}` })),
      error: null,
    });

    await expect(offerTrade("flare-1", "event-1", "holder", null)).resolves.toEqual({
      ok: false,
      reason: "at-cap",
    });
  });

  it("does not count offers on closed Flares against the cap", async () => {
    // Thirty response rows, but only a handful still point at open Flares
    // in this room — last week's offers must not eat tonight's allowance.
    queue("flares", { data: FLARE, error: null }, { count: 3, error: null });
    queue("player_cards", { data: [{ id: "pc-1" }], error: null });
    queue(
      "flare_responses",
      {
        data: Array.from({ length: 30 }, (_, i) => ({ flare_id: `f${i}` })),
        error: null,
      },
      { error: null }, // upsert
    );

    await expect(offerTrade("flare-1", "event-1", "holder", null)).resolves.toEqual({
      ok: true,
    });
  });
});

describe("withdrawOffer", () => {
  it("deletes only the caller's own offer on that Flare", async () => {
    queue("flare_responses", { error: null });

    await expect(withdrawOffer("flare-1", "holder")).resolves.toBe(true);

    expect(calls.flare_responses.delete).toHaveLength(1);
    expect(calls.flare_responses.eq).toEqual([
      ["flare_id", "flare-1"],
      ["responder_session_id", "holder"],
    ]);
  });
});

describe("listRoomOffers", () => {
  const NOW = new Date("2026-08-10T20:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("joins names and presence, and drops responders who left the room", async () => {
    queue("flares", { data: [{ id: "flare-1" }], error: null });
    queue("flare_responses", {
      data: [
        {
          flare_id: "flare-1",
          responder_session_id: "here",
          message: "table 12",
          created_at: "2026-08-10T19:00:00Z",
        },
        {
          flare_id: "flare-1",
          responder_session_id: "gone",
          message: null,
          created_at: "2026-08-10T19:05:00Z",
        },
        {
          flare_id: "flare-1",
          responder_session_id: "idle",
          message: null,
          created_at: "2026-08-10T19:10:00Z",
        },
      ],
      error: null,
    });
    queue("event_participants", {
      data: [
        // "here" seen 1 minute ago; "idle" 40 minutes ago; "gone" left — no row.
        { player_session_id: "here", last_seen_at: "2026-08-10T19:59:00Z" },
        { player_session_id: "idle", last_seen_at: "2026-08-10T19:20:00Z" },
      ],
      error: null,
    });
    queue("player_sessions", {
      data: [
        { id: "here", display_name: "Kaito" },
        { id: "idle", display_name: "Nami" },
      ],
      error: null,
    });

    const offers = await listRoomOffers("event-1");

    expect(offers.map((o) => o.responderSessionId)).toEqual(["here", "idle"]);
    expect(offers[0]).toMatchObject({
      displayName: "Kaito",
      message: "table 12",
      present: true,
    });
    expect(offers[1]).toMatchObject({ displayName: "Nami", present: false });
  });

  it("reads nothing when the room has no open Flares", async () => {
    queue("flares", { data: [], error: null });

    await expect(listRoomOffers("event-1")).resolves.toEqual([]);
    expect(calls.flare_responses).toBeUndefined();
  });
});
