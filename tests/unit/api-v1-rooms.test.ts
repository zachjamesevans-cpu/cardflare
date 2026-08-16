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
const notifyRoomFlare = vi.fn();
const notifyEarlyBoardFlares = vi.fn();
const notifyTradeConfirmed = vi.fn();
const clearWantForFlare = vi.fn();
const linkSessionToPlayer = vi.fn();
const sessionForPlayer = vi.fn();
const playerForUser = vi.fn();
const addSessionToken = vi.fn();
const mergePlayerSessions = vi.fn();
/** Whoever the bearer token resolves to, or null for a guest request. */
const getUser = vi.fn();

vi.mock("@/lib/request-context", () => ({
  clientKey: vi.fn().mockResolvedValue("client-1"),
}));
vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({ auth: { getUser: (...a: unknown[]) => getUser(...a) } }),
}));
vi.mock("@/lib/players/repository", () => ({
  findPlayerSession: (...a: unknown[]) => findPlayerSession(...a),
  touchPlayerSession: (...a: unknown[]) => touchPlayerSession(...a),
  createPlayerSession: (...a: unknown[]) => createPlayerSession(...a),
  deletePlayerSession: vi.fn(),
  renamePlayerSession: vi.fn(),
  addSessionToken: (...a: unknown[]) => addSessionToken(...a),
  mergePlayerSessions: (...a: unknown[]) => mergePlayerSessions(...a),
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
  notifyRoomFlare: (...a: unknown[]) => notifyRoomFlare(...a),
  notifyEarlyBoardFlares: (...a: unknown[]) => notifyEarlyBoardFlares(...a),
}));
vi.mock("@/lib/players/wants", () => ({
  saveWant: (...a: unknown[]) => saveWant(...a),
  clearWantForFlare: (...a: unknown[]) => clearWantForFlare(...a),
}));
vi.mock("@/lib/players/accounts", () => ({
  playerForUser: (...a: unknown[]) => playerForUser(...a),
  linkSessionToPlayer: (...a: unknown[]) => linkSessionToPlayer(...a),
  sessionForPlayer: (...a: unknown[]) => sessionForPlayer(...a),
}));
vi.mock("@/lib/players/locals", () => ({ saveLocal: vi.fn() }));
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
    sessionForPlayer,
    playerForUser,
    addSessionToken,
    mergePlayerSessions,
    getUser,
  ]) {
    fn.mockReset();
  }

  /* A guest request by default: no account behind the bearer token, and
     no room identity for one. The signed-in cases say otherwise. */
  getUser.mockResolvedValue({ data: { user: null }, error: null });
  playerForUser.mockResolvedValue(null);
  sessionForPlayer.mockResolvedValue(null);
  mergePlayerSessions.mockResolvedValue(true);

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

  it("joins an early board days before doors", async () => {
    const HOUR = 60 * 60 * 1000;
    enterRoomByCode.mockResolvedValue({
      id: "event-1",
      kind: "scheduled",
      status: "draft",
      startsAt: new Date(Date.now() + 24 * HOUR).toISOString(),
      endsAt: new Date(Date.now() + 28 * HOUR).toISOString(),
      earlyBoardHours: 48,
    });

    const response = await rooms.POST(request("POST", { displayName: "Nami" }), CODE);

    expect(response.status).toBe(200);
    expect(joinEvent).toHaveBeenCalled();
  });

  it("refuses a draft outside the early window", async () => {
    const HOUR = 60 * 60 * 1000;
    enterRoomByCode.mockResolvedValue({
      id: "event-1",
      kind: "scheduled",
      status: "draft",
      startsAt: new Date(Date.now() + 100 * HOUR).toISOString(),
      endsAt: new Date(Date.now() + 104 * HOUR).toISOString(),
      earlyBoardHours: 48,
    });

    const response = await rooms.POST(request("POST", { displayName: "Nami" }), CODE);

    expect(response.status).toBe(409);
    expect(joinEvent).not.toHaveBeenCalled();
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

/*
 * The duplicate join. Signed in as the same account, the app used to mint
 * its own session and land a second copy of the founder on the board — two
 * participants, two board sections, two binders that never matched.
 *
 * A session is a device; an account is a person. The app now adopts the
 * identity the account already has, and says so.
 */
describe("POST /rooms/[code] — the same account from a second client", () => {
  const WEB_SESSION = {
    id: "sess-web",
    display_name: "Kaito",
    player_id: "player-1",
    token_hash: "x",
  };

  /** The app: a bearer token for the account, and its own session token. */
  function signedIn(withSession = true): Request {
    return new Request("https://cardflare.gg/api/v1/rooms/K3M9PZ", {
      method: "POST",
      headers: {
        authorization: "Bearer jwt",
        "x-cf-payload": "%7B%7D",
        ...(withSession ? { "x-session-token": "tok" } : {}),
      },
    });
  }

  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    playerForUser.mockResolvedValue({ id: "player-1", display_name: "Kaito" });
    sessionForPlayer.mockResolvedValue(WEB_SESSION);
    findParticipation.mockResolvedValue(null);
  });

  it("joins as the identity the account already has", async () => {
    const response = await rooms.POST(signedIn(), CODE);
    const body = await response.json();

    expect(createPlayerSession).not.toHaveBeenCalled();
    expect(joinEvent).toHaveBeenCalledWith("event-1", "sess-web");
    expect(body.you.sessionId).toBe("sess-web");
    expect(body.resumed).toBe(true);
  });

  /* A fresh install holds nothing, so it is handed a token for that
     session — additive, so the website's own token still works. */
  it("hands a fresh install a token for that session", async () => {
    const response = await rooms.POST(signedIn(false), CODE);
    const body = await response.json();

    expect(addSessionToken).toHaveBeenCalledWith("sess-web", expect.any(String));
    expect(typeof body.sessionToken).toBe("string");
  });

  /* The app's own session is real work — a binder, Flares, offers — so it
     is folded in rather than abandoned. */
  it("folds the app's own session into the account's", async () => {
    const response = await rooms.POST(signedIn(), CODE);
    await response.json();

    expect(mergePlayerSessions).toHaveBeenCalledWith("sess-1", "sess-web");
  });

  it("says so when this client is already in the room", async () => {
    sessionForPlayer.mockResolvedValue({ ...SESSION, player_id: "player-1" });
    findParticipation.mockResolvedValue({ lastSeenAt: "now" });

    const response = await rooms.POST(signedIn(), CODE);
    const body = await response.json();

    expect(body.resumed).toBe(true);
    expect(joinEvent).toHaveBeenCalledWith("event-1", "sess-1");
  });

  it("is a plain join when the account has no identity yet", async () => {
    sessionForPlayer.mockResolvedValue(null);

    const response = await rooms.POST(signedIn(), CODE);
    const body = await response.json();

    expect(body.resumed).toBe(false);
    expect(linkSessionToPlayer).toHaveBeenCalledWith("sess-1", "player-1");
    expect(mergePlayerSessions).not.toHaveBeenCalled();
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

  it("the deck label rides the Flare into the board and the saved want", async () => {
    findPlayerSession.mockResolvedValue({ ...SESSION, player_id: "player-1" });

    await flares.POST(
      request("POST", { cardId: FLARE_ID, quantity: 1, deckLabel: "  RG  Luffy " }),
      CODE,
    );

    // Whitespace collapsed by the shared schema, exactly like a note.
    expect(addFlare).toHaveBeenCalledWith(
      "event-1",
      "sess-1",
      expect.objectContaining({ deckLabel: "RG Luffy" }),
      "want",
      expect.anything(),
    );
    expect(saveWant).toHaveBeenCalledWith(
      "player-1",
      expect.objectContaining({ deckLabel: "RG Luffy" }),
    );
  });

  /*
   * Direction and terms over the JSON API.
   *
   * The app and the website post through different doors into the same
   * board, so these pin the app's door to the same answers the Server
   * Action gives — including what an older build, which sends neither
   * field, still posts.
   */
  it("posts a plain trade-only want when the app sends no direction", async () => {
    await flares.POST(request("POST", { cardId: FLARE_ID, quantity: 1 }), CODE);

    expect(addFlare.mock.calls[0]![3]).toBe("want");
    expect(addFlare.mock.calls[0]![4]).toEqual({
      acceptsTrade: true,
      acceptsCash: false,
    });
  });

  it("posts a showcase with cash terms when the app asks for one", async () => {
    await flares.POST(
      request("POST", {
        cardId: FLARE_ID,
        quantity: 1,
        intent: "showcase",
        acceptsTrade: false,
        acceptsCash: true,
      }),
      CODE,
    );

    expect(addFlare.mock.calls[0]![3]).toBe("showcase");
    expect(addFlare.mock.calls[0]![4]).toEqual({
      acceptsTrade: false,
      acceptsCash: true,
    });
  });

  /* A card you are letting go is not a hunt, and saving it as one would
     follow you to the next store as a want for a card you were moving. */
  it("never saves a showcase to the account's want list", async () => {
    findPlayerSession.mockResolvedValue({ ...SESSION, player_id: "player-1" });

    await flares.POST(
      request("POST", { cardId: FLARE_ID, quantity: 1, intent: "showcase" }),
      CODE,
    );

    expect(saveWant).not.toHaveBeenCalled();
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
