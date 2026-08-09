import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The room-loop API's guards. Same invariants as the website's Server
 * Actions: every write re-establishes session, room and membership from
 * scratch; joining is the only door; and a linked account gets the same
 * auto-saved want and notifications the website gives it.
 */

const findPlayerSession = vi.fn();
const touchPlayerSession = vi.fn();
const resolveCode = vi.fn();
const enterRoomByCode = vi.fn();
const findParticipation = vi.fn();
const joinEvent = vi.fn();
const createPlayerSession = vi.fn();
const addFlare = vi.fn();
const cancelFlare = vi.fn();
const setOpenToTrades = vi.fn();
const saveWant = vi.fn();
const offerTrade = vi.fn();
const confirmTrade = vi.fn();
const notifyOfferReceived = vi.fn();
const notifyTradeConfirmed = vi.fn();
const clearWantForFlare = vi.fn();
const linkSessionToPlayer = vi.fn();

vi.mock("@/lib/request-context", () => ({
  clientKey: vi.fn().mockResolvedValue("client-1"),
}));
vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({ auth: { getUser: vi.fn() } }),
}));
vi.mock("@/lib/players/repository", () => ({
  findPlayerSession: (...a: unknown[]) => findPlayerSession(...a),
  touchPlayerSession: (...a: unknown[]) => touchPlayerSession(...a),
  createPlayerSession: (...a: unknown[]) => createPlayerSession(...a),
  deletePlayerSession: vi.fn(),
  renamePlayerSession: vi.fn(),
}));
vi.mock("@/lib/events/rooms", () => ({
  resolveCode: (...a: unknown[]) => resolveCode(...a),
  enterRoomByCode: (...a: unknown[]) => enterRoomByCode(...a),
}));
vi.mock("@/lib/events/participants", () => ({
  findParticipation: (...a: unknown[]) => findParticipation(...a),
  setOpenToTrades: (...a: unknown[]) => setOpenToTrades(...a),
  joinEvent: (...a: unknown[]) => joinEvent(...a),
  listParticipants: vi.fn().mockResolvedValue([]),
  touchParticipation: vi.fn(),
}));
vi.mock("@/lib/lists/repository", () => ({
  addFlare: (...a: unknown[]) => addFlare(...a),
  cancelFlare: (...a: unknown[]) => cancelFlare(...a),
  listBinder: vi.fn().mockResolvedValue([]),
  listRoomFlares: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/matching/repository", () => ({
  offerTrade: (...a: unknown[]) => offerTrade(...a),
  withdrawOffer: vi.fn(),
  listRoomOffers: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/trades/repository", () => ({
  confirmTrade: (...a: unknown[]) => confirmTrade(...a),
}));
vi.mock("@/lib/notifications/notify", () => ({
  notifyOfferReceived: (...a: unknown[]) => notifyOfferReceived(...a),
  notifyTradeConfirmed: (...a: unknown[]) => notifyTradeConfirmed(...a),
}));
vi.mock("@/lib/players/wants", () => ({
  saveWant: (...a: unknown[]) => saveWant(...a),
  clearWantForFlare: (...a: unknown[]) => clearWantForFlare(...a),
}));
vi.mock("@/lib/players/accounts", () => ({
  playerForUser: vi.fn().mockResolvedValue(null),
  linkSessionToPlayer: (...a: unknown[]) => linkSessionToPlayer(...a),
}));
vi.mock("@/lib/players/collection", () => ({
  collectionAvailability: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("@/lib/singles/repository", () => ({
  counterAvailability: vi.fn().mockResolvedValue(new Set()),
}));

const rooms = await import("@/app/api/v1/rooms/[code]/route");
const flares = await import("@/app/api/v1/rooms/[code]/flares/route");
const offers = await import("@/app/api/v1/rooms/[code]/offers/route");
const trades = await import("@/app/api/v1/rooms/[code]/trades/route");
const open = await import("@/app/api/v1/rooms/[code]/open/route");

const CODE = { params: Promise.resolve({ code: "K3M9PZ" }) };
const SESSION = {
  id: "sess-1",
  display_name: "Kaito",
  player_id: null,
  token_hash: "x",
};
const FLARE_ID = "11111111-1111-4111-8111-111111111111";

function request(
  method: string,
  body?: unknown,
  token: string | null = "tok",
): Request {
  return new Request("https://cardflare.gg/api/v1/rooms/K3M9PZ", {
    method,
    headers: token ? { "x-session-token": token } : {},
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  for (const fn of [
    findPlayerSession,
    touchPlayerSession,
    resolveCode,
    enterRoomByCode,
    findParticipation,
    joinEvent,
    createPlayerSession,
    addFlare,
    saveWant,
    offerTrade,
    confirmTrade,
    notifyOfferReceived,
    notifyTradeConfirmed,
    clearWantForFlare,
    linkSessionToPlayer,
  ]) {
    fn.mockReset();
  }

  findPlayerSession.mockResolvedValue(SESSION);
  resolveCode.mockResolvedValue({
    outcome: "room",
    room: { id: "event-1", status: "open", storeId: "store-1", name: "Friday" },
  });
  enterRoomByCode.mockResolvedValue({ id: "event-1", status: "open" });
  findParticipation.mockResolvedValue({ lastSeenAt: "now" });
  joinEvent.mockResolvedValue(true);
  addFlare.mockResolvedValue({ ok: true });
  offerTrade.mockResolvedValue({ ok: true });
  confirmTrade.mockResolvedValue({ ok: true });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /rooms/[code] (join)", () => {
  it("creates a session and returns its token exactly once", async () => {
    findPlayerSession.mockResolvedValue(null);
    createPlayerSession.mockResolvedValue({ ...SESSION, id: "sess-new" });

    const response = await rooms.POST(request("POST", { displayName: "Nami" }), CODE);
    const body = await response.json();

    expect(body.joined).toBe(true);
    expect(typeof body.sessionToken).toBe("string");
    expect(joinEvent).toHaveBeenCalledWith("event-1", "sess-new");
  });

  it("joins from the header transport — no body at all", async () => {
    // The app sends its payload this way on networks that eat bodies.
    findPlayerSession.mockResolvedValue(null);
    createPlayerSession.mockResolvedValue({ ...SESSION, id: "sess-new" });

    const headerJoin = new Request("https://cardflare.gg/api/v1/rooms/K3M9PZ", {
      method: "POST",
      headers: {
        "x-cf-payload": encodeURIComponent(JSON.stringify({ displayName: "Nami" })),
      },
    });
    const response = await rooms.POST(headerJoin, CODE);
    const body = await response.json();

    expect(body.joined).toBe(true);
    expect(joinEvent).toHaveBeenCalledWith("event-1", "sess-new");
  });

  it("refuses a nameless first join", async () => {
    findPlayerSession.mockResolvedValue(null);

    const response = await rooms.POST(request("POST", {}, null), CODE);

    expect(response.status).toBe(400);
    expect(joinEvent).not.toHaveBeenCalled();
  });

  it("refuses a room that is not open", async () => {
    enterRoomByCode.mockResolvedValue({ id: "event-1", status: "closed" });

    const response = await rooms.POST(request("POST", { displayName: "Nami" }), CODE);

    expect(response.status).toBe(409);
  });
});

describe("membership guards on writes", () => {
  it.each([
    [
      "flares",
      () => flares.POST(request("POST", { cardId: FLARE_ID, quantity: 1 }), CODE),
    ],
    ["offers", () => offers.POST(request("POST", { flareId: FLARE_ID }), CODE)],
    ["trades", () => trades.POST(request("POST", { flareId: FLARE_ID }), CODE)],
  ])("%s refuses a non-member", async (_route, call) => {
    findParticipation.mockResolvedValue(null);

    expect((await call()).status).toBe(401);
    expect(addFlare).not.toHaveBeenCalled();
    expect(offerTrade).not.toHaveBeenCalled();
    expect(confirmTrade).not.toHaveBeenCalled();
  });

  it("removing a Flare is scoped to the caller's own session", async () => {
    await flares.DELETE(request("DELETE", { flareId: FLARE_ID }), CODE);

    expect(cancelFlare).toHaveBeenCalledWith(FLARE_ID, "sess-1");
  });

  it("open-to-trades flips only the member's own row", async () => {
    await open.POST(request("POST", { open: true }), CODE);
    expect(setOpenToTrades).toHaveBeenCalledWith("event-1", "sess-1", true);

    findParticipation.mockResolvedValue(null);
    setOpenToTrades.mockClear();
    const response = await open.POST(request("POST", { open: true }), CODE);
    expect(response.status).toBe(401);
    expect(setOpenToTrades).not.toHaveBeenCalled();
  });

  it("a posted Flare saves the want only for a linked account", async () => {
    await flares.POST(request("POST", { cardId: FLARE_ID, quantity: 1 }), CODE);
    expect(saveWant).not.toHaveBeenCalled();

    findPlayerSession.mockResolvedValue({ ...SESSION, player_id: "player-1" });
    await flares.POST(request("POST", { cardId: FLARE_ID, quantity: 2 }), CODE);
    expect(saveWant).toHaveBeenCalledWith("player-1", expect.any(Object));
  });

  it("an offer notifies through the backbone; a confirm notifies the partner", async () => {
    await offers.POST(request("POST", { flareId: FLARE_ID, message: "table 2" }), CODE);
    expect(notifyOfferReceived).toHaveBeenCalledWith(
      FLARE_ID,
      "sess-1",
      "Kaito",
      "table 2",
    );

    const partner = "22222222-2222-4222-8222-222222222222";
    await trades.POST(
      request("POST", { flareId: FLARE_ID, partnerSessionId: partner }),
      CODE,
    );
    expect(clearWantForFlare).toHaveBeenCalledWith(FLARE_ID);
    expect(notifyTradeConfirmed).toHaveBeenCalledWith(FLARE_ID, partner, "Kaito");
  });
});
