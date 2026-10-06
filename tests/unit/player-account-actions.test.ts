import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The player-account actions' guards. Accounts are optional, so the bar is
 * the same as everywhere: an invite is admin-only, a want belongs only to
 * its player, and a re-post re-derives room membership from scratch — every
 * one of these is a public POST endpoint.
 */

const getViewer = vi.fn();
const invitePlayer = vi.fn();
const playerForUser = vi.fn();
const linkSessionToPlayer = vi.fn();
const sendEmail = vi.fn();
const generateSetupLink = vi.fn();
const getPlayerSession = vi.fn();
const resolveCode = vi.fn();
const enterRoomByCode = vi.fn();
const findParticipation = vi.fn();
const joinEvent = vi.fn();
const addFlareBatch = vi.fn();
const listWants = vi.fn();
const removeWant = vi.fn();
const adjustWantQuantity = vi.fn();
const saveLocal = vi.fn();
const removeLocal = vi.fn();
const createPlayerSession = vi.fn();
const renamePlayerSession = vi.fn();
const sessionForPlayer = vi.fn();
const addSessionToken = vi.fn();
const mergePlayerSessions = vi.fn();
const setPlayerCookie = vi.fn();
const redirect = vi.fn((to: string) => {
  throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: "NEXT_REDIRECT" });
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("@/lib/auth/session", () => ({ getViewer: () => getViewer() }));
vi.mock("@/lib/players/accounts", () => ({
  invitePlayer: (...a: unknown[]) => invitePlayer(...a),
  playerForUser: (...a: unknown[]) => playerForUser(...a),
  linkSessionToPlayer: (...a: unknown[]) => linkSessionToPlayer(...a),
  sessionForPlayer: (...a: unknown[]) => sessionForPlayer(...a),
}));
vi.mock("@/lib/email/client", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}));
vi.mock("@/lib/auth/invite-link", () => ({
  generateSetupLink: (...a: unknown[]) => generateSetupLink(...a),
}));
vi.mock("@/lib/players/session", () => ({
  getPlayerSession: () => getPlayerSession(),
  createSessionToken: () => "raw-token",
  hashSessionToken: (raw: string) => `hash:${raw}`,
  setPlayerCookie: (...a: unknown[]) => setPlayerCookie(...a),
}));
vi.mock("@/lib/events/rooms", () => ({
  resolveCode: (...a: unknown[]) => resolveCode(...a),
  enterRoomByCode: (...a: unknown[]) => enterRoomByCode(...a),
}));
vi.mock("@/lib/events/participants", () => ({
  findParticipation: (...a: unknown[]) => findParticipation(...a),
  joinEvent: (...a: unknown[]) => joinEvent(...a),
}));
vi.mock("@/lib/lists/repository", () => ({
  addFlareBatch: (...a: unknown[]) => addFlareBatch(...a),
}));
vi.mock("@/lib/players/wants", () => ({
  listWants: (...a: unknown[]) => listWants(...a),
  removeWant: (...a: unknown[]) => removeWant(...a),
  adjustWantQuantity: (...a: unknown[]) => adjustWantQuantity(...a),
}));
vi.mock("@/lib/players/locals", () => ({
  saveLocal: (...a: unknown[]) => saveLocal(...a),
  removeLocal: (...a: unknown[]) => removeLocal(...a),
}));
vi.mock("@/lib/players/repository", () => ({
  createPlayerSession: (...a: unknown[]) => createPlayerSession(...a),
  renamePlayerSession: (...a: unknown[]) => renamePlayerSession(...a),
  addSessionToken: (...a: unknown[]) => addSessionToken(...a),
  mergePlayerSessions: (...a: unknown[]) => mergePlayerSessions(...a),
}));

const { invitePlayerAction, nudgeWantQuantityAction, removeWantAction, rsvpAction } =
  await import("@/lib/players/account-actions");
const { INVITE_PLAYER_IDLE } = await import("@/lib/players/account-schema");

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const want = (id: string, cardId: string, deckLabel: string | null = null) => ({
  id,
  cardId,
  cardName: "Card",
  cardNumber: "OP01-001",
  printingId: null,
  printingLabel: null,
  quantity: 1,
  note: null,
  deckLabel,
});

beforeEach(() => {
  for (const fn of [
    getViewer,
    invitePlayer,
    playerForUser,
    linkSessionToPlayer,
    sendEmail,
    generateSetupLink,
    getPlayerSession,
    resolveCode,
    enterRoomByCode,
    findParticipation,
    joinEvent,
    addFlareBatch,
    listWants,
    removeWant,
    adjustWantQuantity,
    saveLocal,
    removeLocal,
    createPlayerSession,
    renamePlayerSession,
    sessionForPlayer,
    addSessionToken,
    mergePlayerSessions,
    setPlayerCookie,
    redirect,
  ]) {
    fn.mockReset();
  }
  redirect.mockImplementation((to: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: "NEXT_REDIRECT" });
  });

  getViewer.mockResolvedValue({
    kind: "player",
    user: { id: "u1" },
    playerId: "player-1",
    playerName: "Kaito",
  });
  /* No prior identity for the account: the RSVP cases that need one say so. */
  sessionForPlayer.mockResolvedValue(null);
  linkSessionToPlayer.mockResolvedValue(true);
  mergePlayerSessions.mockResolvedValue(true);
  invitePlayer.mockResolvedValue({ outcome: "invited" });
  sendEmail.mockResolvedValue({ status: "sent" });
  generateSetupLink.mockResolvedValue("https://x/link");
  getPlayerSession.mockResolvedValue({ id: "sess-1", player_id: "player-1" });
  resolveCode.mockResolvedValue({ outcome: "room", room: { id: "event-1" } });
  findParticipation.mockResolvedValue({ lastSeenAt: "now" });
  addFlareBatch.mockResolvedValue({ batchId: "b1", posted: [], atCap: false });
  listWants.mockResolvedValue([want("w1", "c1"), want("w2", "c2")]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("invitePlayerAction", () => {
  const fields = { displayName: "Kaito", email: "kaito@example.com" };

  it("refuses anyone but the admin, silently", async () => {
    const state = await invitePlayerAction(INVITE_PLAYER_IDLE, form(fields));

    expect(state.status).toBe("error");
    expect(invitePlayer).not.toHaveBeenCalled();
  });

  it("invites and emails for the admin", async () => {
    getViewer.mockResolvedValue({ kind: "admin", user: { id: "a1" }, storeIds: [] });

    const state = await invitePlayerAction(INVITE_PLAYER_IDLE, form(fields));

    expect(state.status).toBe("success");
    expect(invitePlayer).toHaveBeenCalledWith(
      { displayName: "Kaito", email: "kaito@example.com" },
      "a1",
    );
    expect(sendEmail).toHaveBeenCalled();
  });

  it("says so when the address already holds an invitation", async () => {
    getViewer.mockResolvedValue({ kind: "admin", user: { id: "a1" }, storeIds: [] });
    invitePlayer.mockResolvedValue({ outcome: "already-invited" });

    const state = await invitePlayerAction(INVITE_PLAYER_IDLE, form(fields));

    expect(state.status).toBe("error");
    if (state.status === "error") {
      expect(state.message).toMatch(/already/i);
    }
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("removeWantAction", () => {
  it("removes only through the signed-in player", async () => {
    await removeWantAction(form({ wantId: "w1" }));

    expect(removeWant).toHaveBeenCalledWith("w1", "player-1");
  });

  it("removes nothing for a guest", async () => {
    getViewer.mockResolvedValue({ kind: "anonymous" });

    await removeWantAction(form({ wantId: "w1" }));

    expect(removeWant).not.toHaveBeenCalled();
  });
});

describe("nudgeWantQuantityAction", () => {
  beforeEach(() => {
    adjustWantQuantity.mockImplementation(async (id: string, _p: string, delta: number) =>
      id === "w1"
        ? { ok: true, quantity: 2 + delta, cardId: "card-1" }
        : { ok: false, reason: "not-found" },
    );
  });

  it("hands the delta to the database, which adds it to what it holds", async () => {
    await nudgeWantQuantityAction(form({ wantId: "w1", delta: "1" }));

    expect(adjustWantQuantity).toHaveBeenCalledWith("w1", "player-1", 1);
  });

  it("subtracts as readily as it adds", async () => {
    await nudgeWantQuantityAction(form({ wantId: "w1", delta: "-1" }));

    expect(adjustWantQuantity).toHaveBeenCalledWith("w1", "player-1", -1);
  });

  it("changes nothing for a guest", async () => {
    getViewer.mockResolvedValue({ kind: "anonymous" });

    await nudgeWantQuantityAction(form({ wantId: "w1", delta: "1" }));

    expect(adjustWantQuantity).not.toHaveBeenCalled();
  });

  it("ignores a delta that is not a usable number", async () => {
    await nudgeWantQuantityAction(form({ wantId: "w1", delta: "banana" }));
    await nudgeWantQuantityAction(form({ wantId: "w1", delta: "0" }));

    expect(adjustWantQuantity).not.toHaveBeenCalled();
  });
});

describe("rsvpAction", () => {
  const HOUR = 60 * 60 * 1000;

  const earlyEvent = () => ({
    id: "event-1",
    storeId: "store-1",
    kind: "scheduled",
    status: "draft",
    startsAt: new Date(Date.now() + 24 * HOUR).toISOString(),
    endsAt: new Date(Date.now() + 28 * HOUR).toISOString(),
    earlyBoardHours: 48,
  });

  it("joins the early board and posts every saved want", async () => {
    enterRoomByCode.mockResolvedValue(earlyEvent());
    joinEvent.mockResolvedValue(true);
    listWants.mockResolvedValue([want("w1", "c1"), want("w2", "c2")]);
    addFlareBatch.mockResolvedValue({
      batchId: "b1",
      posted: ["c1", "c2"],
      atCap: false,
    });

    await expect(rsvpAction(form({ code: "K3M9PZ" }))).rejects.toThrow("NEXT_REDIRECT");

    expect(joinEvent).toHaveBeenCalledWith("event-1", "sess-1");
    /* An RSVP is one act too: one batch, whatever the list's length. */
    expect(addFlareBatch).toHaveBeenCalledTimes(1);
    expect(saveLocal).toHaveBeenCalledWith("player-1", "store-1");
  });

  it("creates a session from the account's own name when none exists", async () => {
    getPlayerSession.mockResolvedValue(null);
    createPlayerSession.mockResolvedValue({ id: "sess-new", player_id: null });
    enterRoomByCode.mockResolvedValue(earlyEvent());
    joinEvent.mockResolvedValue(true);
    listWants.mockResolvedValue([]);

    await expect(rsvpAction(form({ code: "K3M9PZ" }))).rejects.toThrow("NEXT_REDIRECT");

    expect(createPlayerSession).toHaveBeenCalledWith("Kaito", "hash:raw-token");
    expect(setPlayerCookie).toHaveBeenCalledWith("raw-token");
    expect(linkSessionToPlayer).toHaveBeenCalledWith("sess-new", "player-1");
  });

  it("joins a posted night ahead of its early window (Nights round 1)", async () => {
    /* A night is a door from the day it is posted: the same rule as
       Going, boardWritable in src/lib/events/schema.ts. */
    enterRoomByCode.mockResolvedValue({
      ...earlyEvent(),
      startsAt: new Date(Date.now() + 100 * HOUR).toISOString(),
      endsAt: new Date(Date.now() + 104 * HOUR).toISOString(),
    });

    await rsvpAction(form({ code: "K3M9PZ" }));

    expect(joinEvent).toHaveBeenCalled();
  });

  it("refuses a draft whose start has passed and was never opened", async () => {
    enterRoomByCode.mockResolvedValue({
      ...earlyEvent(),
      startsAt: new Date(Date.now() - 30 * HOUR).toISOString(),
      endsAt: new Date(Date.now() - 26 * HOUR).toISOString(),
    });

    await rsvpAction(form({ code: "K3M9PZ" }));

    expect(joinEvent).not.toHaveBeenCalled();
    expect(addFlareBatch).not.toHaveBeenCalled();
  });

  it("is a silent no-op for anyone without a player account", async () => {
    getViewer.mockResolvedValue({ kind: "anonymous" });

    await rsvpAction(form({ code: "K3M9PZ" }));

    expect(enterRoomByCode).not.toHaveBeenCalled();
  });
});
