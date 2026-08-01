import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetRateLimits } from "@/lib/rate-limit";

const findEventByJoinCode = vi.fn();
const joinEvent = vi.fn();
const leaveEvent = vi.fn();
const createPlayerSession = vi.fn();
const deletePlayerSession = vi.fn();
const getPlayerSession = vi.fn();
const setPlayerCookie = vi.fn();
const isSupabaseConfigured = vi.fn(() => true);

let requestHeaders: Record<string, string> = {};

class RedirectError extends Error {
  constructor(public readonly to: string) {
    super(`redirect:${to}`);
  }
}

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => requestHeaders[name.toLowerCase()] ?? null,
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => isSupabaseConfigured(),
  getSupabaseAdmin: () => {
    throw new Error("not used in this test");
  },
}));

vi.mock("@/lib/events/repository", () => ({
  findEventByJoinCode: (...a: unknown[]) => findEventByJoinCode(...a),
}));

vi.mock("@/lib/events/participants", () => ({
  joinEvent: (...a: unknown[]) => joinEvent(...a),
  leaveEvent: (...a: unknown[]) => leaveEvent(...a),
}));

vi.mock("@/lib/players/repository", () => ({
  SESSION_TTL_MS: 1000,
  createPlayerSession: (...a: unknown[]) => createPlayerSession(...a),
  deletePlayerSession: (...a: unknown[]) => deletePlayerSession(...a),
}));

vi.mock("@/lib/players/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/players/session")>();
  return {
    ...actual,
    getPlayerSession: () => getPlayerSession(),
    setPlayerCookie: (...a: unknown[]) => setPlayerCookie(...a),
  };
});

const { joinEventAction, leaveEventAction } =
  await import("@/lib/events/join-event-actions");
const { JOIN_PLAYER_IDLE } = await import("@/lib/players/schema");

const OPEN_EVENT = { id: "event-1", status: "open" };

function formData(fields: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ code: "K3M9PZ", ...fields })) {
    data.set(key, value);
  }
  return data;
}

const join = (data: FormData) => joinEventAction(JOIN_PLAYER_IDLE, data);

async function captureRedirect(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof RedirectError) return error.to;
    throw error;
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  resetRateLimits();
  findEventByJoinCode.mockReset().mockResolvedValue(OPEN_EVENT);
  joinEvent.mockReset().mockResolvedValue(true);
  leaveEvent.mockReset().mockResolvedValue(undefined);
  createPlayerSession.mockReset().mockResolvedValue({ id: "session-new" });
  deletePlayerSession.mockReset().mockResolvedValue(undefined);
  getPlayerSession.mockReset().mockResolvedValue(null);
  setPlayerCookie.mockReset().mockResolvedValue(undefined);
  isSupabaseConfigured.mockReset().mockReturnValue(true);
  requestHeaders = { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("joinEventAction — a new player", () => {
  it("creates an identity and joins in one submission", async () => {
    const to = await captureRedirect(() => join(formData({ displayName: "Zach" })));

    expect(to).toBe("/e/K3M9PZ");
    expect(createPlayerSession).toHaveBeenCalledOnce();
    expect(joinEvent).toHaveBeenCalledWith("event-1", "session-new");
    expect(setPlayerCookie).toHaveBeenCalledOnce();
  });

  it("normalises the display name", async () => {
    await captureRedirect(() => join(formData({ displayName: "  Zach   E  " })));

    expect(createPlayerSession).toHaveBeenCalledWith("Zach E", expect.any(String));
  });

  it("rejects an invalid name without creating anything", async () => {
    const result = await join(formData({ displayName: "Z" }));

    expect(result.status).toBe("error");
    expect(createPlayerSession).not.toHaveBeenCalled();
    expect(joinEvent).not.toHaveBeenCalled();
  });

  /*
   * The identity is written before the room membership. If the second write
   * fails, an orphaned session plus a cookie pointing at it is worse than
   * nothing — the player would look signed in and be in no room.
   */
  it("rolls back the new identity when joining the room fails", async () => {
    joinEvent.mockResolvedValue(false);

    const result = await join(formData({ displayName: "Zach" }));

    expect(result.status).toBe("error");
    expect(deletePlayerSession).toHaveBeenCalledWith("session-new");
    expect(setPlayerCookie).not.toHaveBeenCalled();
  });
});

describe("joinEventAction — a returning player", () => {
  beforeEach(() => {
    getPlayerSession.mockResolvedValue({ id: "session-known", display_name: "Zach" });
  });

  it("joins without creating a second identity", async () => {
    await captureRedirect(() => join(formData()));

    expect(createPlayerSession).not.toHaveBeenCalled();
    expect(joinEvent).toHaveBeenCalledWith("event-1", "session-known");
  });

  it("does not reissue the cookie", async () => {
    await captureRedirect(() => join(formData()));

    expect(setPlayerCookie).not.toHaveBeenCalled();
  });

  /*
   * The player always comes from the cookie. A session id in the form would
   * let anyone drop someone else into a room.
   */
  it("ignores a session id supplied by the client", async () => {
    await captureRedirect(() =>
      join(formData({ playerSessionId: "someone-else", displayName: "Mallory" })),
    );

    expect(joinEvent).toHaveBeenCalledWith("event-1", "session-known");
  });

  it("does not rename them from the form", async () => {
    await captureRedirect(() => join(formData({ displayName: "Someone Else" })));

    expect(createPlayerSession).not.toHaveBeenCalled();
  });
});

describe("joinEventAction — refusals", () => {
  it("refuses a room that is not open", async () => {
    for (const status of ["draft", "closed"]) {
      findEventByJoinCode.mockResolvedValue({ ...OPEN_EVENT, status });

      const result = await join(formData({ displayName: "Zach" }));

      expect(result.status).toBe("error");
      expect(joinEvent).not.toHaveBeenCalled();
    }
  });

  it("refuses an event that does not exist", async () => {
    findEventByJoinCode.mockResolvedValue(null);

    const result = await join(formData({ displayName: "Zach" }));

    expect(result.status).toBe("error");
    expect(joinEvent).not.toHaveBeenCalled();
  });

  it("refuses a tampered code without querying", async () => {
    const result = await join(formData({ code: "!!!!", displayName: "Zach" }));

    expect(result.status).toBe("error");
    expect(findEventByJoinCode).not.toHaveBeenCalled();
  });

  it("accepts a lowercase code from the URL", async () => {
    await captureRedirect(() =>
      join(formData({ code: "k3m9pz", displayName: "Zach" })),
    );

    expect(findEventByJoinCode).toHaveBeenCalledWith("K3M9PZ");
  });

  it("reports a generic error when Supabase is unavailable", async () => {
    isSupabaseConfigured.mockReturnValue(false);

    const result = await join(formData({ displayName: "Zach" }));

    expect(result.status).toBe("error");
    expect(result.status === "error" && result.message).not.toMatch(/supabase/i);
  });

  it("throttles a flood from one network but allows a busy counter", async () => {
    requestHeaders = { "x-forwarded-for": "203.0.113.11" };

    for (let i = 0; i < 20; i += 1) {
      await captureRedirect(() => join(formData({ displayName: `Player ${i}` })));
    }
    expect(joinEvent).toHaveBeenCalledTimes(20);

    const blocked = await join(formData({ displayName: "One too many" }));
    expect(blocked.status).toBe("error");
    expect(joinEvent).toHaveBeenCalledTimes(20);
  });
});

describe("leaveEventAction", () => {
  it("removes the player from the room but keeps their identity", async () => {
    getPlayerSession.mockResolvedValue({ id: "session-known", display_name: "Zach" });

    const to = await captureRedirect(() => leaveEventAction(formData()));

    expect(to).toBe("/e/K3M9PZ");
    expect(leaveEvent).toHaveBeenCalledWith("event-1", "session-known");
    expect(deletePlayerSession).not.toHaveBeenCalled();
  });

  it("does nothing for a player with no session", async () => {
    getPlayerSession.mockResolvedValue(null);

    await captureRedirect(() => leaveEventAction(formData()));

    expect(leaveEvent).not.toHaveBeenCalled();
  });

  it("ignores a tampered code", async () => {
    await leaveEventAction(formData({ code: "!!!!" }));

    expect(leaveEvent).not.toHaveBeenCalled();
  });
});
