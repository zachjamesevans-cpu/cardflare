import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What a television is allowed to know.
 *
 * A display token is handed to a browser on a shelf in a shop. It is not
 * a session, it belongs to nobody, and anybody who reads the URL off the
 * screen has it. So the question these tests exist to answer is the one
 * the whole feature turns on: can that token reach anything a shop's
 * customers should not be looking at?
 *
 * The answer has to stay no as the payload grows, which is why this
 * asserts the WHOLE shape rather than picking at fields — a new key
 * added to the payload fails here until somebody has thought about it.
 */

const findStoreById = vi.fn();
const resolveCode = vi.fn();
const listRoomFlares = vi.fn();
const counterAvailability = vi.fn();
const listTimers = vi.fn();

vi.mock("@/lib/events/repository", () => ({
  findStoreById: (...a: unknown[]) => findStoreById(...a),
}));
vi.mock("@/lib/events/rooms", () => ({
  resolveCode: (...a: unknown[]) => resolveCode(...a),
}));
vi.mock("@/lib/events/qr", () => ({
  joinUrl: (code: string) => `https://cardflare.gg/e/${code}`,
}));
vi.mock("@/lib/lists/repository", () => ({
  listRoomFlares: (...a: unknown[]) => listRoomFlares(...a),
}));
vi.mock("@/lib/singles/repository", () => ({
  counterAvailability: (...a: unknown[]) => counterAvailability(...a),
}));
vi.mock("@/lib/event-hub/repository", () => ({
  listTimers: (...a: unknown[]) => listTimers(...a),
}));

const { displayPayload } = await import("@/lib/event-hub/display-payload");

const DISPLAY = {
  id: "display-1",
  storeId: "store-1",
  name: "Main display",
  nightTitle: "MONDAY TCG NIGHT",
  token: "0123456789abcdef0123456789abcdef",
  layout: "auto" as const,
  announcement: null,
  showFlares: true,
  showQr: true,
  soundEnabled: false,
};

function flare(overrides: Record<string, unknown> = {}) {
  return {
    id: "flare-1",
    quantity: 2,
    note: null,
    deckLabel: null,
    postedBatch: null,
    cardId: "card-1",
    cardNumber: "OP01-016",
    cardName: "Nami",
    printingId: null,
    printingLabel: null,
    imageUrl: "/api/card-art/op01/OP01-016.png",
    playerSessionId: "session-1",
    displayName: "CHUNC",
    confirmedAt: null,
    intent: "want",
    acceptsTrade: true,
    acceptsCash: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findStoreById.mockResolvedValue({
    id: "store-1",
    name: "Mox Valley Games",
    join_code: "ABC2345",
  });
  listTimers.mockResolvedValue([]);
  listRoomFlares.mockResolvedValue([]);
  counterAvailability.mockResolvedValue(new Set());
  resolveCode.mockResolvedValue({
    outcome: "room",
    room: { id: "event-1", status: "open" },
  });
});

describe("the display payload", () => {
  it("carries exactly these keys and no others", () => {
    /* Deliberately exhaustive. Adding a field to the payload should fail
       this test until somebody has decided a television may show it. */
    return displayPayload(DISPLAY).then((payload) => {
      expect(Object.keys(payload).sort()).toEqual(
        [
          "announcement",
          "displayId",
          "flares",
          "joinCode",
          "joinUrl",
          "layout",
          "nightTitle",
          "serverNow",
          "showFlares",
          "showQr",
          "soundEnabled",
          "storeName",
          "timers",
        ].sort(),
      );
    });
  });

  it("never hands back the token it was reached with", async () => {
    const payload = await displayPayload(DISPLAY);

    expect(JSON.stringify(payload)).not.toContain(DISPLAY.token);
  });

  it("carries the server's own clock, so a wrong TV clock costs nothing", async () => {
    const before = Date.now();
    const payload = await displayPayload(DISPLAY);

    expect(payload.serverNow).toBeGreaterThanOrEqual(before);
  });
});

describe("what reaches the wall from the board", () => {
  it("shows a card somebody publicly asked for", async () => {
    listRoomFlares.mockResolvedValue([flare()]);

    const { flares } = await displayPayload(DISPLAY);

    expect(flares).toEqual([
      {
        cardId: "card-1",
        cardName: "Nami",
        cardNumber: "OP01-016",
        imageUrl: "/api/card-art/op01/OP01-016.png",
        quantity: 2,
        people: 1,
        askedBy: "CHUNC",
        storeMayHave: false,
      },
    ]);
  });

  it("never shows a showcase Flare, though it is public", async () => {
    /* "I have this and would let it go" is a public post, but projected
       on a wall it reads as an inventory. Only wants reach the screen. */
    listRoomFlares.mockResolvedValue([
      flare({ intent: "showcase", cardId: "card-2", cardName: "Zoro" }),
    ]);

    const { flares } = await displayPayload(DISPLAY);

    expect(flares).toEqual([]);
  });

  it("carries nothing that identifies a session or an account", async () => {
    listRoomFlares.mockResolvedValue([flare()]);

    const payload = await displayPayload(DISPLAY);
    const body = JSON.stringify(payload);

    /* A display name is what the board already shows a room. A session
       id, a flare id or a batch id is not. */
    expect(body).not.toContain("session-1");
    expect(body).not.toContain("flare-1");
    for (const key of ["playerSessionId", "playerId", "avatarUrl", "handle", "note"]) {
      expect(body).not.toContain(key);
    }
  });

  it("groups a card several people want, and stops naming anyone", async () => {
    listRoomFlares.mockResolvedValue([
      flare({ id: "a", playerSessionId: "s1", displayName: "CHUNC", quantity: 1 }),
      flare({ id: "b", playerSessionId: "s2", displayName: "Ava", quantity: 2 }),
      flare({ id: "c", playerSessionId: "s3", displayName: "Will", quantity: 1 }),
    ]);

    const [card] = (await displayPayload(DISPLAY)).flares;

    expect(card.people).toBe(3);
    expect(card.quantity).toBe(4);
    expect(card.askedBy).toBeNull();
  });

  it("counts one person posting several copies as one person", async () => {
    listRoomFlares.mockResolvedValue([
      flare({ id: "a", playerSessionId: "s1", quantity: 2 }),
      flare({ id: "b", playerSessionId: "s1", quantity: 2 }),
    ]);

    const [card] = (await displayPayload(DISPLAY)).flares;

    expect(card.people).toBe(1);
    expect(card.quantity).toBe(4);
  });

  it("says only that the counter may have a card somebody asked for", async () => {
    listRoomFlares.mockResolvedValue([flare()]);
    counterAvailability.mockResolvedValue(new Set(["card-1"]));

    const [card] = (await displayPayload(DISPLAY)).flares;

    expect(card.storeMayHave).toBe(true);
    /* One boolean per card already on the board. There is no path from
       here to the store's stock list, and no price anywhere. */
    expect(counterAvailability).toHaveBeenCalledWith("store-1", ["card-1"]);
    expect(card).not.toHaveProperty("price");
  });

  it("asks for no Flares at all when the store turned the board off", async () => {
    listRoomFlares.mockResolvedValue([flare()]);

    const payload = await displayPayload({ ...DISPLAY, showFlares: false });

    expect(payload.flares).toEqual([]);
    expect(listRoomFlares).not.toHaveBeenCalled();
  });

  it("shows nothing when no room is open", async () => {
    resolveCode.mockResolvedValue({ outcome: "lobby", store: {}, earlyBoard: null });

    const payload = await displayPayload(DISPLAY);

    expect(payload.flares).toEqual([]);
    expect(listRoomFlares).not.toHaveBeenCalled();
  });

  it("never opens a room by being looked at", async () => {
    await displayPayload(DISPLAY);

    /* `resolveCode` finds a live room; `enterRoomByCode` opens one. A
       television left on overnight must only ever do the first. */
    expect(resolveCode).toHaveBeenCalledWith("ABC2345");
  });
});
