import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetRateLimits } from "@/lib/rate-limit";

const createPlayerSession = vi.fn();
const renamePlayerSession = vi.fn();
const deletePlayerSession = vi.fn();
const getPlayerSession = vi.fn();
const setPlayerCookie = vi.fn();
const clearPlayerCookie = vi.fn();
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

vi.mock("@/lib/players/repository", () => ({
  SESSION_TTL_MS: 1000,
  createPlayerSession: (...args: unknown[]) => createPlayerSession(...args),
  renamePlayerSession: (...args: unknown[]) => renamePlayerSession(...args),
  deletePlayerSession: (...args: unknown[]) => deletePlayerSession(...args),
}));

vi.mock("@/lib/players/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/players/session")>();
  return {
    ...actual,
    getPlayerSession: () => getPlayerSession(),
    setPlayerCookie: (...args: unknown[]) => setPlayerCookie(...args),
    clearPlayerCookie: () => clearPlayerCookie(),
  };
});

const { joinAsPlayer, renamePlayer, leaveAsPlayer } =
  await import("@/lib/players/actions");
const { JOIN_PLAYER_IDLE } = await import("@/lib/players/schema");

function formData(displayName?: string) {
  const data = new FormData();
  if (displayName !== undefined) data.set("displayName", displayName);
  return data;
}

const join = (data: FormData) => joinAsPlayer(JOIN_PLAYER_IDLE, data);

/** Runs an action that is expected to redirect, and returns the destination. */
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
  createPlayerSession.mockReset().mockResolvedValue({ id: "session-1" });
  renamePlayerSession.mockReset().mockResolvedValue(undefined);
  deletePlayerSession.mockReset().mockResolvedValue(undefined);
  getPlayerSession.mockReset().mockResolvedValue({ id: "session-1" });
  setPlayerCookie.mockReset().mockResolvedValue(undefined);
  clearPlayerCookie.mockReset().mockResolvedValue(undefined);
  isSupabaseConfigured.mockReset().mockReturnValue(true);
  requestHeaders = { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("joinAsPlayer", () => {
  it("creates a session and signs the browser into it", async () => {
    const to = await captureRedirect(() => join(formData("Zach")));

    expect(to).toBe("/play");
    expect(createPlayerSession).toHaveBeenCalledOnce();
    expect(setPlayerCookie).toHaveBeenCalledOnce();
  });

  it("stores the normalised name, not what was typed", async () => {
    await captureRedirect(() => join(formData("   Zach    E   ")));

    expect(createPlayerSession).toHaveBeenCalledWith("Zach E", expect.any(String));
  });

  /*
   * The row must never hold anything that could resume the session. The cookie
   * gets the token; the database gets its hash.
   */
  it("passes a hash to the database and the token to the cookie", async () => {
    await captureRedirect(() => join(formData("Zach")));

    const [, storedHash] = createPlayerSession.mock.calls[0]!;
    const [cookieToken] = setPlayerCookie.mock.calls[0]!;

    expect(storedHash).toMatch(/^[0-9a-f]{64}$/);
    expect(storedHash).not.toBe(cookieToken);
    expect(storedHash).not.toContain(cookieToken);
  });

  it("gives every player a different token", async () => {
    await captureRedirect(() => join(formData("One")));
    await captureRedirect(() => join(formData("Two")));

    expect(setPlayerCookie.mock.calls[0]![0]).not.toBe(
      setPlayerCookie.mock.calls[1]![0],
    );
  });

  it("rejects a name that fails validation without touching the database", async () => {
    const result = await join(formData("Z"));

    expect(result.status).toBe("error");
    expect(createPlayerSession).not.toHaveBeenCalled();
    expect(setPlayerCookie).not.toHaveBeenCalled();
  });

  it("echoes the rejected name back so it is not retyped", async () => {
    const result = await join(formData("Z"));

    expect(result).toMatchObject({ status: "error", displayName: "Z" });
  });

  it("treats an absent field as an empty name rather than crashing", async () => {
    const result = await join(formData());

    expect(result.status).toBe("error");
  });

  it("reports a generic error when the database is unavailable", async () => {
    createPlayerSession.mockRejectedValue(new Error("relation does not exist"));

    const result = await join(formData("Zach"));

    expect(result).toMatchObject({ status: "error" });
    expect(result.status === "error" && result.message).not.toMatch(/relation/i);
    expect(setPlayerCookie).not.toHaveBeenCalled();
  });

  it("reports a generic error when Supabase is not configured", async () => {
    isSupabaseConfigured.mockReturnValue(false);

    const result = await join(formData("Zach"));

    expect(result.status).toBe("error");
    expect(createPlayerSession).not.toHaveBeenCalled();
  });

  /*
   * A whole store shares one network. The limit has to stop a script without
   * locking out a queue of players scanning the same code at the same counter.
   */
  it("throttles a flood from one address but allows a busy counter", async () => {
    requestHeaders = { "x-forwarded-for": "203.0.113.7" };

    for (let i = 0; i < 20; i += 1) {
      await captureRedirect(() => join(formData(`Player ${i}`)));
    }
    expect(createPlayerSession).toHaveBeenCalledTimes(20);

    const blocked = await join(formData("One too many"));
    expect(blocked.status).toBe("error");
    expect(createPlayerSession).toHaveBeenCalledTimes(20);
  });
});

describe("renamePlayer", () => {
  it("renames the session identified by the cookie", async () => {
    const result = await renamePlayer(JOIN_PLAYER_IDLE, formData("New Name"));

    expect(result.status).toBe("idle");
    expect(renamePlayerSession).toHaveBeenCalledWith("session-1", "New Name");
  });

  /*
   * Authorisation is the cookie, never a field in the request. Submitting
   * someone else's id must change nothing.
   */
  it("ignores any session id supplied by the client", async () => {
    const data = formData("New Name");
    data.set("id", "someone-elses-session");

    await renamePlayer(JOIN_PLAYER_IDLE, data);

    expect(renamePlayerSession).toHaveBeenCalledWith("session-1", "New Name");
  });

  it("sends a player with no session back to join", async () => {
    getPlayerSession.mockResolvedValue(null);

    const to = await captureRedirect(() =>
      renamePlayer(JOIN_PLAYER_IDLE, formData("New Name")),
    );

    expect(to).toBe("/play");
    expect(renamePlayerSession).not.toHaveBeenCalled();
  });

  it("rejects an invalid name without writing", async () => {
    const result = await renamePlayer(JOIN_PLAYER_IDLE, formData("Z"));

    expect(result.status).toBe("error");
    expect(renamePlayerSession).not.toHaveBeenCalled();
  });
});

describe("leaveAsPlayer", () => {
  it("deletes the session and clears the cookie", async () => {
    const to = await captureRedirect(() => leaveAsPlayer());

    expect(to).toBe("/play");
    expect(deletePlayerSession).toHaveBeenCalledWith("session-1");
    expect(clearPlayerCookie).toHaveBeenCalledOnce();
  });

  // A stale cookie with no row behind it must still be cleared.
  it("clears the cookie even when there is no session to delete", async () => {
    getPlayerSession.mockResolvedValue(null);

    await captureRedirect(() => leaveAsPlayer());

    expect(deletePlayerSession).not.toHaveBeenCalled();
    expect(clearPlayerCookie).toHaveBeenCalledOnce();
  });
});
