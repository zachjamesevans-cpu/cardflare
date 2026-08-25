import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the Feed shows a player on the day they sign up.
 *
 * Every other item on that screen is personalised — a friend's hunt, a
 * saved store's board, a trade where you play — so on a brand-new
 * account they all return nothing, and the one render that decides
 * whether somebody comes back would teach "nothing happens here". This
 * covers the three answers to that: a notice from us, the two questions
 * the Feed cannot derive, and rooms that are open somewhere regardless
 * of who is reading.
 *
 * The ORDER is the argument, so it is asserted rather than implied.
 */

const showingAnnouncements = vi.fn();
const findEventByJoinCode = vi.fn();
const listRoomFlares = vi.fn();
const listBinder = vi.fn();
const sessionsForPlayers = vi.fn();
const listFollowing = vi.fn();
const listLocals = vi.fn();
const listOpenStores = vi.fn();
const listWants = vi.fn();

/* Enough of a query builder to be awaited at any point in a chain. The
   day-one paths never reach it; the ones with a saved store do, and all
   they need back is "nothing". */
const nothing = { data: [], error: null };
const admin: Record<string, unknown> = {
  then: (resolve: (value: typeof nothing) => void) => resolve(nothing),
};
for (const method of [
  "from",
  "select",
  "in",
  "eq",
  "gt",
  "lte",
  "neq",
  "gte",
  /* "has a coordinate at all", for the nearby-stores origin. */
  "not",
  "order",
  "limit",
  /* Reads that end in one row rather than a list: the Embers balance the
     evergreen items are measured against. Awaited like the rest, so it
     comes back as "nothing" the same way. */
  "maybeSingle",
]) {
  admin[method] = () => admin;
}

vi.mock("@/lib/announcements/repository", () => ({
  showingAnnouncements: () => showingAnnouncements(),
}));
vi.mock("@/lib/events/repository", () => ({
  findEventByJoinCode: (...a: unknown[]) => findEventByJoinCode(...a),
}));
vi.mock("@/lib/lists/repository", () => ({
  listRoomFlares: (...a: unknown[]) => listRoomFlares(...a),
  listBinder: (...a: unknown[]) => listBinder(...a),
}));
vi.mock("@/lib/players/accounts", () => ({
  sessionsForPlayers: (...a: unknown[]) => sessionsForPlayers(...a),
}));
vi.mock("@/lib/players/follows", () => ({
  listFollowing: (...a: unknown[]) => listFollowing(...a),
}));
vi.mock("@/lib/players/locals", () => ({
  listLocals: (...a: unknown[]) => listLocals(...a),
  listOpenStores: (...a: unknown[]) => listOpenStores(...a),
}));
vi.mock("@/lib/players/wants", () => ({
  listWants: (...a: unknown[]) => listWants(...a),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => admin,
  isSupabaseConfigured: () => true,
}));

const { listFeed } = await import("@/lib/feed/repository");

function store(overrides: Record<string, unknown> = {}) {
  return {
    storeId: "store-1",
    name: "Dice & Dragons",
    city: "Tempe",
    region: "AZ",
    joinCode: "DND",
    savedAt: "",
    liveNow: true,
    nextEventAt: null,
    nextEventName: null,
    nextEventCode: null,
    earlyOpen: false,
    timeZone: "America/Phoenix",
    walkIn: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  showingAnnouncements.mockResolvedValue([]);
  listLocals.mockResolvedValue([]);
  listOpenStores.mockResolvedValue([]);
  listFollowing.mockResolvedValue([]);
  listWants.mockResolvedValue([]);
  listBinder.mockResolvedValue([]);
  listRoomFlares.mockResolvedValue([]);
  sessionsForPlayers.mockResolvedValue(new Map());
  findEventByJoinCode.mockResolvedValue({
    id: "event-1",
    name: "Friday Night",
    storeTimeZone: "America/Phoenix",
  });
});

describe("the Feed on a quiet Tuesday", () => {
  /*
   * Round two, and the bug that caused it. Measured on the founder's own
   * account - a saved store, a want list, nothing live anywhere - the
   * whole Feed came back with zero items. Every kind was gated on live or
   * recent activity, and the two starters that would have filled the gap
   * only appear while a player has NO store and NO wants. So the screen
   * was empty for exactly the established player it was built to keep.
   */
  it("is not empty for a player with a store and a want list", async () => {
    listLocals.mockResolvedValue([
      store({ liveNow: false, nextEventAt: null, nextEventCode: null }),
    ]);
    listWants.mockResolvedValue([{ cardId: "card-1" }]);

    const items = await listFeed("player-1", null);

    expect(items.length).toBeGreaterThan(0);
    /* And the thing it leads with is the store, not a shop tile: an
       evergreen item may fill a gap, never take the top. */
    expect(items[0].kind).toBe("upcoming");
  });

  it("says walk in when there is no night on the calendar", async () => {
    listLocals.mockResolvedValue([
      store({ liveNow: false, nextEventAt: null, nextEventCode: null }),
    ]);

    const items = await listFeed("player-1", null);
    const upcoming = items.find((item) => item.kind === "upcoming");

    expect(upcoming).toMatchObject({ walkIn: true, nextEventAt: null });
  });

  it("drops a store with neither a night nor walk-ins", async () => {
    /* "Nothing is happening at four shops" is worse than a short feed. */
    listLocals.mockResolvedValue([
      store({
        liveNow: false,
        nextEventAt: null,
        nextEventCode: null,
        walkIn: false,
      }),
    ]);

    const items = await listFeed("player-1", null);

    expect(items.some((item) => item.kind === "upcoming")).toBe(false);
  });

  it("never lists a store twice, as a board and as upcoming", async () => {
    /* A live store is already a board above; repeating it under a second
       heading is the drift this set exists to prevent. */
    listLocals.mockResolvedValue([store({ liveNow: true })]);

    const items = await listFeed("player-1", null);

    expect(items.some((item) => item.kind === "upcoming")).toBe(false);
  });
});

describe("the Feed on day one", () => {
  it("is not empty for an account that has told us nothing", async () => {
    showingAnnouncements.mockResolvedValue([
      {
        id: "notice-1",
        headline: "OP-17 lands Friday",
        body: "Paste your list now.",
        linkLabel: "Paste a deck list",
        linkHref: "/profile/settings",
        startsAt: "",
        expiresAt: "",
      },
    ]);
    listOpenStores.mockResolvedValue([store()]);

    const items = await listFeed("player-1", null);

    /* The notice, then the two questions, then the rooms that answer the
       first of them. Nothing here needed anything from the player.

       And last, the third question: where are you. It ASKS rather than
       vanishing, which is the whole point of it - a section that
       disappears when we do not know where somebody is teaches them
       nothing, and this is the only way a player discovers that
       cardflare knows about shops near them. Last because it is the one
       item that needs a permission or a typed ZIP before it can pay
       anybody back. */
    expect(items.map((item) => item.kind)).toEqual([
      "announcement",
      "start",
      "start",
      "board",
      "nearbyStores",
    ]);
  });

  it("does not explain Nearby with a rule it stopped following", async () => {
    /*
     * The reason line under an item is the sentence a reader trusts to
     * explain why they are looking at it, and this one went stale: it
     * still read "Shops near the ones you have saved" after the origin
     * had stopped being a saved store and become the player's own
     * location. A reason that describes a rule we no longer follow is
     * worse than no reason at all.
     */
    listOpenStores.mockResolvedValue([]);

    const items = await listFeed("player-1", null);
    const nearby = items.find((item) => item.kind === "nearbyStores");

    expect(nearby).toBeDefined();
    expect(nearby!.reason).not.toMatch(/saved/i);
    /* Nothing is known about where they are, so it asks. */
    expect(nearby!.reason).toBe("Tell us roughly where you are");
  });

  it("wears the mark rather than a face — there is no cardflare player", async () => {
    showingAnnouncements.mockResolvedValue([
      {
        id: "notice-1",
        headline: "OP-17 lands Friday",
        body: "Paste your list now.",
        linkLabel: null,
        linkHref: null,
        startsAt: "",
        expiresAt: "",
      },
    ]);

    const [notice] = await listFeed("player-1", null);

    expect(notice.kind).toBe("announcement");
    /* Nothing followable, nothing with an avatar, nothing with a
       playerId — the item cannot be mistaken for a person. */
    expect(notice).not.toHaveProperty("playerId");
    expect(notice).not.toHaveProperty("avatarUrl");
  });

  it("asks where you play only until you have somewhere", async () => {
    const before = await listFeed("player-1", null);
    expect(before.some((item) => item.kind === "start" && item.topic === "store")).toBe(
      true,
    );

    listLocals.mockResolvedValue([store()]);
    const after = await listFeed("player-1", null);

    expect(after.some((item) => item.kind === "start" && item.topic === "store")).toBe(
      false,
    );
  });

  it("asks what you are hunting only until you are hunting something", async () => {
    const before = await listFeed("player-1", null);
    expect(before.some((item) => item.kind === "start" && item.topic === "deck")).toBe(
      true,
    );

    listWants.mockResolvedValue([{ cardId: "card-1" }]);
    const after = await listFeed("player-1", null);

    expect(after.some((item) => item.kind === "start" && item.topic === "deck")).toBe(
      false,
    );
  });
});

describe("rooms open somewhere else", () => {
  it("never repeats a store the player already saved", async () => {
    listLocals.mockResolvedValue([store()]);

    await listFeed("player-1", null);

    expect(listOpenStores).toHaveBeenCalledWith(["store-1"], expect.any(Number));
  });

  it("puts your own store above one you have never been to", async () => {
    listLocals.mockResolvedValue([store()]);
    listOpenStores.mockResolvedValue([
      store({ storeId: "store-2", name: "Kaiju Cards", city: "Mesa", joinCode: "KJU" }),
    ]);

    const boards = (await listFeed("player-1", null)).filter(
      (item) => item.kind === "board",
    );

    expect(boards.map((board) => board.storeName)).toEqual([
      "Dice & Dragons",
      "Kaiju Cards",
    ]);
    expect(boards.map((board) => board.yours)).toEqual([true, false]);
  });

  it("carries the city, because a room you have never been to needs a place", async () => {
    listOpenStores.mockResolvedValue([store()]);

    const [board] = (await listFeed("player-1", null)).filter(
      (item) => item.kind === "board",
    );

    expect(board.city).toBe("Tempe");
  });

  it("walks onto an early board, not just an open room", async () => {
    /* The founder's OP-17 ask: post your Flares before doors. A board
       taking them early is as much news as a room already going. */
    listOpenStores.mockResolvedValue([
      store({
        liveNow: false,
        earlyOpen: true,
        nextEventCode: "FRI",
        nextEventName: "Friday Night",
        nextEventAt: "2026-08-21T02:00:00Z",
      }),
    ]);

    const [board] = (await listFeed("player-1", null)).filter(
      (item) => item.kind === "board",
    );

    expect(board.live).toBe(false);
    expect(board.code).toBe("FRI");
    expect(board.startsAt).toBe("2026-08-21T02:00:00Z");
  });
});
