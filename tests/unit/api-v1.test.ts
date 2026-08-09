import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The JSON API the native app talks to. The rules under test: a request
 * is somebody only when its bearer token verifies against the project
 * AND a players row exists; every route answers 401 identically without
 * one; and every write is keyed on the authenticated player, so one
 * account can never touch another's devices or inbox.
 */

type Response_ = Record<string, unknown>;

function chain(response: Response_, calls: Record<string, unknown[][]>) {
  const c: Record<string, unknown> = {};

  for (const method of [
    "select",
    "eq",
    "in",
    "is",
    "order",
    "limit",
    "insert",
    "update",
    "upsert",
    "delete",
  ]) {
    c[method] = vi.fn((...args: unknown[]) => {
      (calls[method] ??= []).push(args);
      return c;
    });
  }

  c.maybeSingle = () => Promise.resolve(response);
  c.then = (resolve: (v: Response_) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(response).then(resolve, reject);

  return c;
}

const queues: Record<string, Response_[]> = {};
const calls: Record<string, Record<string, unknown[][]>> = {};
const getUser = vi.fn();
const playerForUser = vi.fn();
const listWants = vi.fn();
const collectionSyncFor = vi.fn();
const listLocals = vi.fn();
const removeLocal = vi.fn();

function queue(table: string, ...responses: Response_[]) {
  (queues[table] ??= []).push(...responses);
}

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const response = queues[table]?.shift() ?? { data: null, error: null };
      return chain(response, (calls[table] ??= {}));
    },
    auth: { getUser: (...a: unknown[]) => getUser(...a) },
  }),
}));
vi.mock("@/lib/players/accounts", () => ({
  playerForUser: (...a: unknown[]) => playerForUser(...a),
}));
vi.mock("@/lib/players/wants", () => ({
  listWants: (...a: unknown[]) => listWants(...a),
}));
vi.mock("@/lib/players/collection", () => ({
  collectionSyncFor: (...a: unknown[]) => collectionSyncFor(...a),
}));
vi.mock("@/lib/players/locals", () => ({
  listLocals: (...a: unknown[]) => listLocals(...a),
  removeLocal: (...a: unknown[]) => removeLocal(...a),
}));

const me = await import("@/app/api/v1/me/route");
const devices = await import("@/app/api/v1/devices/route");
const notifications = await import("@/app/api/v1/notifications/route");
const locals = await import("@/app/api/v1/locals/route");

function request(
  method: string,
  body?: unknown,
  token: string | null = "jwt-1",
): Request {
  return new Request("https://cardflare.gg/api/v1/x", {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  for (const store of [queues, calls]) {
    for (const key of Object.keys(store)) delete store[key];
  }
  for (const fn of [
    getUser,
    playerForUser,
    listWants,
    collectionSyncFor,
    listLocals,
    removeLocal,
  ]) {
    fn.mockReset();
  }

  getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  playerForUser.mockResolvedValue({ id: "player-1", display_name: "Kaito" });
  listWants.mockResolvedValue([]);
  collectionSyncFor.mockResolvedValue(null);
  listLocals.mockResolvedValue([]);
  removeLocal.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("authentication", () => {
  it("answers 401 without a bearer token, on every route", async () => {
    for (const call of [
      () => me.GET(request("GET", undefined, null)),
      () => devices.POST(request("POST", {}, null)),
      () => notifications.GET(request("GET", undefined, null)),
    ]) {
      expect((await call()).status).toBe(401);
    }
  });

  it("answers 401 for a valid user with no player account", async () => {
    playerForUser.mockResolvedValue(null);

    expect((await me.GET(request("GET"))).status).toBe(401);
  });

  it("answers 401 when the token does not verify", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad" } });

    expect((await me.GET(request("GET"))).status).toBe(401);
  });
});

describe("GET /api/v1/me", () => {
  it("returns the account snapshot", async () => {
    listWants.mockResolvedValue([
      {
        id: "w1",
        cardId: "c1",
        cardName: "Perona",
        cardNumber: "OP12-034",
        printingId: "p1",
        printingLabel: "Alternate Art",
        quantity: 1,
        note: null,
      },
    ]);
    collectionSyncFor.mockResolvedValue({
      cards_matched: 77,
      synced_at: "2026-08-06T00:00:00Z",
    });

    const response = await me.GET(request("GET"));
    const body = await response.json();

    expect(body.player).toEqual({ id: "player-1", displayName: "Kaito" });
    expect(body.wants).toHaveLength(1);
    expect(body.collection).toEqual({
      cardsMatched: 77,
      syncedAt: "2026-08-06T00:00:00Z",
    });
  });
});

describe("your locals over the API", () => {
  it("includes the saved stores in the /me snapshot", async () => {
    listLocals.mockResolvedValue([
      {
        storeId: "s1",
        name: "Mox Valley Games",
        city: "Renton",
        region: "WA",
        joinCode: "MXV7Q2R",
        savedAt: "2026-08-09T00:00:00Z",
        liveNow: true,
        nextEventAt: null,
        nextEventName: null,
        nextEventCode: "K3M9PZ",
        earlyOpen: true,
      },
    ]);

    const body = await (await me.GET(request("GET"))).json();

    expect(listLocals).toHaveBeenCalledWith("player-1");
    expect(body.locals).toEqual([
      {
        storeId: "s1",
        name: "Mox Valley Games",
        city: "Renton",
        region: "WA",
        code: "MXV7Q2R",
        liveNow: true,
        nextEventAt: null,
        nextEventName: null,
        nextEventCode: "K3M9PZ",
        earlyOpen: true,
      },
    ]);
  });

  it("removes a local for the authenticated player only", async () => {
    const storeId = "11111111-1111-4111-8111-111111111111";
    const response = await locals.DELETE(request("DELETE", { storeId }));

    expect(response.status).toBe(200);
    expect(removeLocal).toHaveBeenCalledWith("player-1", storeId);
  });

  it("refuses a removal without a verified player", async () => {
    playerForUser.mockResolvedValue(null);

    const response = await locals.DELETE(
      request("DELETE", { storeId: "11111111-1111-4111-8111-111111111111" }),
    );

    expect(response.status).toBe(401);
    expect(removeLocal).not.toHaveBeenCalled();
  });

  it("refuses a malformed store id", async () => {
    const response = await locals.DELETE(request("DELETE", { storeId: "nope" }));

    expect(response.status).toBe(400);
    expect(removeLocal).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/devices", () => {
  it("registers a token under the caller, moving it if it exists", async () => {
    queue("player_devices", { error: null });

    const response = await devices.POST(
      request("POST", { platform: "ios", pushToken: "ExponentPushToken[x]" }),
    );

    expect(response.status).toBe(200);
    expect(calls.player_devices.upsert?.[0]?.[0]).toMatchObject({
      player_id: "player-1",
      platform: "ios",
      push_token: "ExponentPushToken[x]",
    });
    expect(calls.player_devices.upsert?.[0]?.[1]).toMatchObject({
      onConflict: "push_token",
    });
  });

  it("rejects an unknown platform", async () => {
    const response = await devices.POST(
      request("POST", { platform: "smartwatch", pushToken: "t" }),
    );

    expect(response.status).toBe(400);
    expect(calls.player_devices).toBeUndefined();
  });

  it("unregisters only the caller's own token", async () => {
    queue("player_devices", { error: null });

    await devices.DELETE(request("DELETE", { pushToken: "t1" }));

    expect(calls.player_devices.eq).toEqual([
      ["push_token", "t1"],
      ["player_id", "player-1"],
    ]);
  });
});

describe("notifications inbox", () => {
  it("lists the caller's notifications, newest first", async () => {
    queue("notifications", {
      data: [
        {
          id: "n1",
          kind: "offer-received",
          title: "Kaito has your Perona",
          body: null,
          url: "/e/K3M9PZ",
          created_at: "2026-08-07T00:00:00Z",
          read_at: null,
        },
      ],
      error: null,
    });

    const response = await notifications.GET(request("GET"));
    const body = await response.json();

    expect(calls.notifications.eq).toEqual([["player_id", "player-1"]]);
    expect(body.notifications[0]).toMatchObject({
      id: "n1",
      title: "Kaito has your Perona",
    });
  });

  it("marks read only within the caller's own rows", async () => {
    queue("notifications", { error: null });

    await notifications.POST(request("POST", { ids: ["n1", "n2"] }));

    expect(calls.notifications.in).toEqual([["id", ["n1", "n2"]]]);
    expect(calls.notifications.eq).toEqual([["player_id", "player-1"]]);
  });
});
