import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Open to trades": the answer for somebody who cannot name what they want.
 *
 * Two things worth pinning. First, it is broadcast to the whole room — unlike
 * the Have list, which is deliberately private — so the write path has to be
 * as careful as any other: the player comes from the cookie, never the form,
 * and announcing it must not be a way into a room.
 *
 * Second, it exists so that a player with nothing posted still appears on the
 * board. The grouping is what delivers that, and it is easy to write a version
 * that quietly drops exactly the person it was built for.
 */

const getPlayerSession = vi.fn();
const resolveCode = vi.fn();
const findParticipation = vi.fn();
const setOpenToTrades = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (p: string) => redirect(p) }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => "203.0.113.7" }),
}));

vi.mock("@/lib/players/session", () => ({
  getPlayerSession: () => getPlayerSession(),
  createSessionToken: vi.fn(),
  hashSessionToken: vi.fn(),
  setPlayerCookie: vi.fn(),
}));
vi.mock("@/lib/players/repository", () => ({
  createPlayerSession: vi.fn(),
  deletePlayerSession: vi.fn(),
  renamePlayerSession: vi.fn(),
}));
vi.mock("@/lib/events/rooms", () => ({
  resolveCode: (...a: unknown[]) => resolveCode(...a),
  enterRoomByCode: vi.fn(),
}));
vi.mock("@/lib/events/participants", () => ({
  findParticipation: (...a: unknown[]) => findParticipation(...a),
  setOpenToTrades: (...a: unknown[]) => setOpenToTrades(...a),
  joinEvent: vi.fn(),
  leaveEvent: vi.fn(),
}));

const { setOpenToTradesAction } = await import("@/lib/events/join-event-actions");
const { groupByPlayer } = await import("@/lib/lists/schema");

const SESSION = { id: "player-1", display_name: "BrandNewPlayer" };
const ROOM = { id: "room-1" };

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function run(fields: Record<string, string> = {}) {
  try {
    await setOpenToTradesAction(form({ code: "K3M9PZ", open: "on", ...fields }));
  } catch (error) {
    const message = (error as Error).message;
    if (!message.startsWith("REDIRECT:")) throw error;
  }
}

beforeEach(() => {
  for (const fn of [
    getPlayerSession,
    resolveCode,
    findParticipation,
    setOpenToTrades,
    redirect,
  ]) {
    fn.mockReset();
  }

  getPlayerSession.mockResolvedValue(SESSION);
  resolveCode.mockResolvedValue({ outcome: "room", room: ROOM });
  findParticipation.mockResolvedValue({ joinedAt: "", lastSeenAt: "" });
  setOpenToTrades.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("setOpenToTradesAction", () => {
  it("turns it on for the room the code resolves to", async () => {
    await run({ open: "on" });

    expect(setOpenToTrades).toHaveBeenCalledWith("room-1", "player-1", true);
  });

  it("turns it off again", async () => {
    await run({ open: "off" });

    expect(setOpenToTrades).toHaveBeenCalledWith("room-1", "player-1", false);
  });

  /* Anything that is not an explicit "on" is off — a missing field included. */
  it("treats an unrecognised value as off", async () => {
    for (const open of ["", "true", "1", "ON", "yes"]) {
      setOpenToTrades.mockClear();
      await run({ open });

      expect(setOpenToTrades).toHaveBeenCalledWith("room-1", "player-1", false);
    }
  });

  /*
   * The player is taken from the cookie, never the form. Otherwise anyone
   * could advertise somebody else as up for a trade.
   */
  it("ignores a session id supplied in the form", async () => {
    await run({ playerSessionId: "somebody-else" });

    expect(setOpenToTrades).toHaveBeenCalledWith("room-1", "player-1", true);
  });

  it("does nothing without a session", async () => {
    getPlayerSession.mockResolvedValue(null);

    await run();

    expect(setOpenToTrades).not.toHaveBeenCalled();
  });

  it("does nothing for a player who is not in the room", async () => {
    findParticipation.mockResolvedValue(null);

    await run();

    expect(setOpenToTrades).not.toHaveBeenCalled();
  });

  it("does nothing when the code resolves to no room", async () => {
    resolveCode.mockResolvedValue({ outcome: "lobby", store: { id: "s" } });

    await run();

    expect(setOpenToTrades).not.toHaveBeenCalled();
  });

  it("rejects a malformed code before touching anything", async () => {
    await run({ code: "nope" });

    expect(getPlayerSession).not.toHaveBeenCalled();
    expect(setOpenToTrades).not.toHaveBeenCalled();
  });

  /*
   * Resolved, never entered. Saying you are open to trades must not be a way
   * of opening a store's walk-in room.
   */
  it("never opens a room", async () => {
    const { enterRoomByCode } = await import("@/lib/events/rooms");

    await run();

    expect(enterRoomByCode).not.toHaveBeenCalled();
  });

  it("survives the write failing", async () => {
    setOpenToTrades.mockRejectedValue(new Error("database is on fire"));

    await expect(run()).resolves.toBeUndefined();
  });
});

/**
 * The board's grouping, which decides who is visible.
 *
 * `groupByPlayer` is unchanged, but the board now adds players who are open to
 * trades and have posted nothing. These cover the merge that sits on top of
 * it, using the same shapes the component works with.
 */
describe("who appears on the board", () => {
  const entry = (playerSessionId: string, displayName: string) => ({
    playerSessionId,
    displayName,
  });

  /** Mirrors the component: groups from Flares, then the open-only players. */
  function board(
    entries: { playerSessionId: string; displayName: string | null }[],
    open: { playerSessionId: string; displayName: string }[],
  ) {
    const groups = groupByPlayer(entries);
    const posted = new Set(groups.map((group) => group.playerSessionId));

    return {
      groups,
      browsing: open.filter((player) => !posted.has(player.playerSessionId)),
    };
  }

  /* The whole point: somebody with nothing posted still shows up. */
  it("puts a player with no Flares on the board", () => {
    const result = board([], [entry("new", "BrandNewPlayer")]);

    expect(result.groups).toHaveLength(0);
    expect(result.browsing.map((p) => p.displayName)).toEqual(["BrandNewPlayer"]);
  });

  /* And is not listed twice when they have also posted something. */
  it("does not duplicate a player who posted Flares as well", () => {
    const result = board([entry("uta", "theUtaGuy")], [entry("uta", "theUtaGuy")]);

    expect(result.groups).toHaveLength(1);
    expect(result.browsing).toHaveLength(0);
  });

  it("keeps players with specific requests ahead of the browsers", () => {
    const result = board([entry("uta", "theUtaGuy")], [entry("new", "BrandNewPlayer")]);

    expect(result.groups.map((g) => g.playerSessionId)).toEqual(["uta"]);
    expect(result.browsing.map((p) => p.playerSessionId)).toEqual(["new"]);
  });

  it("shows nothing extra when nobody is open", () => {
    const result = board([entry("uta", "theUtaGuy")], []);

    expect(result.browsing).toHaveLength(0);
  });
});
