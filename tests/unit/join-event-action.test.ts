import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetRateLimits } from "@/lib/rate-limit";

const findEventByJoinCode = vi.fn();
const joinEvent = vi.fn();
const leaveEvent = vi.fn();
const createPlayerSession = vi.fn();
const deletePlayerSession = vi.fn();
const renamePlayerSession = vi.fn();
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
  renamePlayerSession: (...a: unknown[]) => renamePlayerSession(...a),
}));

/*
 * A signed-in account now overrides whatever name the form submits, so
 * these tests have to say which viewer they are exercising. Anonymous
 * by default: every case below is the guest path, which is the one that
 * still reads a name out of the form.
 */
const accountIdentity = vi.fn(
  async () => null as { playerId: string; displayName: string } | null,
);

vi.mock("@/lib/players/account-identity", () => ({
  accountIdentity: (...a: unknown[]) => accountIdentity(...(a as [])),
}));

const linkSessionToPlayer = vi.fn(async () => {});
vi.mock("@/lib/players/accounts", () => ({
  linkSessionToPlayer: (...a: unknown[]) => linkSessionToPlayer(...(a as [])),
}));

const saveLocal = vi.fn(async () => {});
vi.mock("@/lib/players/locals", () => ({
  saveLocal: (...a: unknown[]) => saveLocal(...(a as [])),
}));

vi.mock("@/lib/auth/session", () => ({
  getViewer: async () => ({ kind: "anonymous" }) as const,
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
  renamePlayerSession.mockReset().mockResolvedValue(undefined);
  getPlayerSession.mockReset().mockResolvedValue(null);
  setPlayerCookie.mockReset().mockResolvedValue(undefined);
  isSupabaseConfigured.mockReset().mockReturnValue(true);
  accountIdentity.mockReset().mockResolvedValue(null);
  linkSessionToPlayer.mockReset();
  saveLocal.mockReset();
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
      join(formData({ playerSessionId: "someone-else", displayName: "Zach" })),
    );

    expect(joinEvent).toHaveBeenCalledWith("event-1", "session-known");
  });
});

/*
 * The name the form fills in is editable, and changing it must not cost the
 * player anything. `player_cards`, `flares` and room membership all hang off
 * the session id, so a rename that created a new session would silently
 * abandon the player's binder.
 */
describe("joinEventAction — a returning player changing their name", () => {
  beforeEach(() => {
    getPlayerSession.mockResolvedValue({ id: "session-known", display_name: "Zach" });
  });

  it("renames the same session rather than starting a new one", async () => {
    await captureRedirect(() => join(formData({ displayName: "Zachary" })));

    expect(renamePlayerSession).toHaveBeenCalledWith("session-known", "Zachary");
    expect(createPlayerSession).not.toHaveBeenCalled();
    expect(deletePlayerSession).not.toHaveBeenCalled();
  });

  it("keeps them attached to the same identity, so their binder follows", async () => {
    await captureRedirect(() => join(formData({ displayName: "Zachary" })));

    expect(joinEvent).toHaveBeenCalledWith("event-1", "session-known");
    expect(setPlayerCookie).not.toHaveBeenCalled();
  });

  /* No write when nothing changed — this runs on every single join. */
  it("does not write when the name is unchanged", async () => {
    await captureRedirect(() => join(formData({ displayName: "Zach" })));

    expect(renamePlayerSession).not.toHaveBeenCalled();
  });

  it("ignores surrounding whitespace rather than treating it as a change", async () => {
    await captureRedirect(() => join(formData({ displayName: "  Zach  " })));

    expect(renamePlayerSession).not.toHaveBeenCalled();
  });

  /*
   * The field is pre-filled, so an empty one means it never arrived. Keeping
   * the old name beats refusing to let a known player into the room.
   */
  it("keeps the existing name when the field is empty", async () => {
    await captureRedirect(() => join(formData({ displayName: "" })));

    expect(renamePlayerSession).not.toHaveBeenCalled();
    expect(joinEvent).toHaveBeenCalledWith("event-1", "session-known");
  });

  it("applies the same name rules as a new player", async () => {
    const state = await join(formData({ displayName: "Z" }));

    expect(state.status).toBe("error");
    expect(renamePlayerSession).not.toHaveBeenCalled();
    expect(joinEvent).not.toHaveBeenCalled();
  });

  it("does not drop them into the room if the rename fails", async () => {
    renamePlayerSession.mockRejectedValue(new Error("database down"));

    const state = await join(formData({ displayName: "Zachary" }));

    expect(state.status).toBe("error");
    expect(joinEvent).not.toHaveBeenCalled();
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

/*
 * The founder's report: "even when I'm signed into my account, it's not
 * auto filling my username from my profile. It's kinda just still
 * signing me in as a guest."
 *
 * The rule that fixes it is that the account's name wins over anything
 * the form carries — not that the form is pre-filled, which is what the
 * old behaviour amounted to.
 */
describe("joinEventAction — a signed-in player", () => {
  const ACCOUNT = { playerId: "player-1", displayName: "Chunc" };

  it("joins under the account's name, not the one in the form", async () => {
    accountIdentity.mockResolvedValue(ACCOUNT);

    await captureRedirect(() => join(formData({ displayName: "Somebody Else" })));

    expect(createPlayerSession).toHaveBeenCalledWith("Chunc", expect.any(String));
  });

  it("joins under the account's name when the form carries none at all", async () => {
    accountIdentity.mockResolvedValue(ACCOUNT);

    await captureRedirect(() => join(formData()));

    expect(createPlayerSession).toHaveBeenCalledWith("Chunc", expect.any(String));
  });

  /*
   * Renamed in place rather than replaced: the binder, the Flares and
   * every room membership hang off the session id.
   */
  it("renames an existing guest session onto the account's name", async () => {
    accountIdentity.mockResolvedValue(ACCOUNT);
    getPlayerSession.mockResolvedValue({
      id: "session-old",
      display_name: "Guest Name",
      player_id: null,
    });

    await captureRedirect(() => join(formData({ displayName: "Ignored" })));

    expect(renamePlayerSession).toHaveBeenCalledWith("session-old", "Chunc");
    expect(createPlayerSession).not.toHaveBeenCalled();
  });

  it("leaves a session that already matches alone", async () => {
    accountIdentity.mockResolvedValue(ACCOUNT);
    getPlayerSession.mockResolvedValue({
      id: "session-old",
      display_name: "Chunc",
      player_id: "player-1",
    });

    await captureRedirect(() => join(formData()));

    expect(renamePlayerSession).not.toHaveBeenCalled();
  });

  it("claims the session for the account", async () => {
    accountIdentity.mockResolvedValue(ACCOUNT);

    await captureRedirect(() => join(formData()));

    expect(linkSessionToPlayer).toHaveBeenCalledWith("session-new", "player-1");
  });

  /* Guests are untouched by all of the above. */
  it("still reads the form for a guest", async () => {
    accountIdentity.mockResolvedValue(null);

    await captureRedirect(() => join(formData({ displayName: "Just Passing" })));

    expect(createPlayerSession).toHaveBeenCalledWith(
      "Just Passing",
      expect.any(String),
    );
    expect(linkSessionToPlayer).not.toHaveBeenCalled();
  });
});
