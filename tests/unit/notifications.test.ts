import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The notification backbone's rules: accounts only (a guest session
 * resolves to nobody and nothing is recorded), one notification per
 * underlying event (the dedupe key refusing is silence, not failure),
 * and the record is written even when there is no email to deliver to —
 * the row is the app's future inbox.
 */

type Response = Record<string, unknown>;

function chain(response: Response, calls: Record<string, unknown[][]>) {
  const c: Record<string, unknown> = {};

  for (const method of ["select", "eq", "in", "insert", "update", "upsert", "delete"]) {
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
const getUserById = vi.fn();
const sendEmail = vi.fn();

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
    auth: { admin: { getUserById: (...a: unknown[]) => getUserById(...a) } },
  }),
}));
vi.mock("@/lib/email/client", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}));
const collectionAvailability = vi.fn();
vi.mock("@/lib/players/collection", () => ({
  collectionAvailability: (...a: unknown[]) => collectionAvailability(...a),
}));

const { notifyOfferReceived, notifyTradeConfirmed, notifyEarlyBoardFlares } =
  await import("@/lib/notifications/notify");

/** The Flare, its card and its room, queued for `flareContext`. */
function queueFlareContext() {
  queue("flares", {
    data: { player_session_id: "owner-sess", card_id: "c1", event_id: "e1" },
    error: null,
  });
  queue("cards", { data: { exact_name: "Perona" }, error: null });
  queue("events", { data: { join_code: "K3M9PZ" }, error: null });
}

beforeEach(() => {
  for (const store of [queues, calls]) {
    for (const key of Object.keys(store)) delete store[key];
  }
  getUserById.mockReset();
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ status: "sent", id: "email-1" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("notifyOfferReceived", () => {
  it("records once and emails the Flare's owner", async () => {
    queueFlareContext();
    queue("player_sessions", { data: { player_id: "player-1" }, error: null });
    queue("players", { data: { id: "player-1", user_id: "u1" }, error: null });
    getUserById.mockResolvedValue({ data: { user: { email: "owner@example.com" } } });
    queue("notifications", { data: { id: "n1" }, error: null }); // insert
    queue("notifications", { error: null }); // emailed_at update

    await notifyOfferReceived("f1", "resp-sess", "Kaito", "table 2");

    expect(calls.notifications.insert?.[0]?.[0]).toMatchObject({
      player_id: "player-1",
      kind: "offer-received",
      title: "Kaito has your Perona",
      body: "They said: “table 2”",
      url: "/e/K3M9PZ",
      dedupe_key: "offer:f1:resp-sess",
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        subject: "Kaito has your Perona",
      }),
    );
    expect(calls.notifications.update).toHaveLength(1);
  });

  it("does nothing for a guest owner — no account, no channel", async () => {
    queueFlareContext();
    queue("player_sessions", { data: { player_id: null }, error: null });

    await notifyOfferReceived("f1", "resp-sess", "Kaito", null);

    expect(calls.notifications).toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("stays silent when the dedupe key already exists", async () => {
    queueFlareContext();
    queue("player_sessions", { data: { player_id: "player-1" }, error: null });
    queue("players", { data: { id: "player-1", user_id: "u1" }, error: null });
    getUserById.mockResolvedValue({ data: { user: { email: "owner@example.com" } } });
    queue("notifications", { data: null, error: { code: "23505" } });

    await notifyOfferReceived("f1", "resp-sess", "Kaito", "moved to table 5");

    expect(sendEmail).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("still records for an account with no email address", async () => {
    queueFlareContext();
    queue("player_sessions", { data: { player_id: "player-1" }, error: null });
    queue("players", { data: { id: "player-1", user_id: "u1" }, error: null });
    getUserById.mockResolvedValue({ data: { user: { email: null } } });
    queue("notifications", { data: { id: "n1" }, error: null });

    await notifyOfferReceived("f1", "resp-sess", "Kaito", null);

    expect(calls.notifications.insert).toHaveLength(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("push delivery", () => {
  it("sends to every registered device and prunes the dead ones", async () => {
    queueFlareContext();
    queue("player_sessions", { data: { player_id: "player-1" }, error: null });
    queue("players", { data: { id: "player-1", user_id: "u1" }, error: null });
    getUserById.mockResolvedValue({ data: { user: { email: null } } });
    queue("notifications", { data: { id: "n1" }, error: null });
    queue("player_devices", {
      data: [
        { id: "d1", push_token: "ExponentPushToken[live]" },
        { id: "d2", push_token: "ExponentPushToken[gone]" },
      ],
      error: null,
    });
    queue("player_devices", { error: null }); // prune delete

    const fetchMock = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          data: [
            { status: "ok" },
            { status: "error", details: { error: "DeviceNotRegistered" } },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await notifyOfferReceived("f1", "resp-sess", "Kaito", "table 2");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    const payload = JSON.parse(String(init.body)) as { to: string }[];
    expect(payload.map((message) => message.to)).toEqual([
      "ExponentPushToken[live]",
      "ExponentPushToken[gone]",
    ]);

    // Only the token the push service disowned is deleted.
    expect(calls.player_devices.in).toEqual([["id", ["d2"]]]);

    vi.unstubAllGlobals();
  });

  it("touches nothing when the account has no devices", async () => {
    queueFlareContext();
    queue("player_sessions", { data: { player_id: "player-1" }, error: null });
    queue("players", { data: { id: "player-1", user_id: "u1" }, error: null });
    getUserById.mockResolvedValue({ data: { user: { email: null } } });
    queue("notifications", { data: { id: "n1" }, error: null });
    queue("player_devices", { data: [], error: null });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await notifyOfferReceived("f1", "resp-sess", "Kaito", null);

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("notifyTradeConfirmed", () => {
  it("notifies the partner, not the confirmer", async () => {
    queueFlareContext();
    queue("player_sessions", { data: { player_id: "player-2" }, error: null });
    queue("players", { data: { id: "player-2", user_id: "u2" }, error: null });
    getUserById.mockResolvedValue({
      data: { user: { email: "partner@example.com" } },
    });
    queue("notifications", { data: { id: "n2" }, error: null });
    queue("notifications", { error: null });

    await notifyTradeConfirmed("f1", "partner-sess", "CHUNC");

    expect(calls.notifications.insert?.[0]?.[0]).toMatchObject({
      player_id: "player-2",
      kind: "trade-confirmed",
      title: "Trade confirmed: Perona",
      dedupe_key: "trade:f1:partner-sess",
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "partner@example.com" }),
    );
  });
});

describe("notifyEarlyBoardFlares", () => {
  const EVENT = {
    data: {
      id: "e1",
      name: "Wednesday Locals",
      join_code: "K3M9PZ",
      starts_at: "2026-08-12T18:00:00Z",
      store_id: "store-1",
    },
    error: null,
  };

  beforeEach(() => {
    collectionAvailability.mockReset();
    collectionAvailability.mockResolvedValue(new Map());
  });

  it("records one digest per saver, with their own match count", async () => {
    queue("events", EVENT);
    queue("stores", { data: { name: "Mox Valley Games" }, error: null });
    queue("flares", { data: [{ card_id: "c1" }, { card_id: "c2" }], error: null });
    queue("player_locals", { data: [{ player_id: "p9" }], error: null });
    queue("event_participants", { data: [], error: null });
    collectionAvailability.mockResolvedValue(new Map([["c1", new Set(["pr1"])]]));
    queue("notifications", { data: { id: "n1" }, error: null });
    queue("player_devices", { data: [], error: null });
    queue("players", { data: { user_id: "u9" }, error: null });
    getUserById.mockResolvedValue({ data: { user: { email: "p9@x.gg" } } });
    sendEmail.mockResolvedValue({ status: "sent" });

    await notifyEarlyBoardFlares("e1");

    const inserted = calls.notifications.insert?.[0]?.[0] as Record<string, unknown>;
    expect(inserted).toMatchObject({
      player_id: "p9",
      kind: "early-board",
      dedupe_key: "early-board:e1:p9",
      url: "/e/K3M9PZ",
    });
    expect(String(inserted.body)).toContain("you own 1 of them");
  });

  it("skips savers who are already on the board", async () => {
    queue("events", EVENT);
    queue("stores", { data: { name: "Mox Valley Games" }, error: null });
    queue("flares", { data: [{ card_id: "c1" }], error: null });
    queue("player_locals", { data: [{ player_id: "p9" }], error: null });
    queue("event_participants", {
      data: [{ player_session_id: "sess-9" }],
      error: null,
    });
    queue("player_sessions", { data: [{ player_id: "p9" }], error: null });

    await notifyEarlyBoardFlares("e1");

    expect(calls.notifications?.insert).toBeUndefined();
  });

  it("stays silent while the board is empty", async () => {
    queue("events", EVENT);
    queue("stores", { data: { name: "Mox Valley Games" }, error: null });
    queue("flares", { data: [], error: null });
    queue("player_locals", { data: [{ player_id: "p9" }], error: null });
    queue("event_participants", { data: [], error: null });

    await notifyEarlyBoardFlares("e1");

    expect(calls.notifications?.insert).toBeUndefined();
  });
});
