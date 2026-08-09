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
const addFlare = vi.fn();
const listWants = vi.fn();
const removeWant = vi.fn();
const saveLocal = vi.fn();
const removeLocal = vi.fn();
const createPlayerSession = vi.fn();
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
  addFlare: (...a: unknown[]) => addFlare(...a),
}));
vi.mock("@/lib/players/wants", () => ({
  listWants: (...a: unknown[]) => listWants(...a),
  removeWant: (...a: unknown[]) => removeWant(...a),
}));
vi.mock("@/lib/players/locals", () => ({
  saveLocal: (...a: unknown[]) => saveLocal(...a),
  removeLocal: (...a: unknown[]) => removeLocal(...a),
}));
vi.mock("@/lib/players/repository", () => ({
  createPlayerSession: (...a: unknown[]) => createPlayerSession(...a),
}));

const { invitePlayerAction, removeWantAction, repostWantsAction, rsvpAction } =
  await import("@/lib/players/account-actions");
const { INVITE_PLAYER_IDLE, REPOST_IDLE } =
  await import("@/lib/players/account-schema");

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
    addFlare,
    listWants,
    removeWant,
    saveLocal,
    removeLocal,
    createPlayerSession,
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
  invitePlayer.mockResolvedValue({ outcome: "invited" });
  sendEmail.mockResolvedValue({ status: "sent" });
  generateSetupLink.mockResolvedValue("https://x/link");
  getPlayerSession.mockResolvedValue({ id: "sess-1", player_id: "player-1" });
  resolveCode.mockResolvedValue({ outcome: "room", room: { id: "event-1" } });
  findParticipation.mockResolvedValue({ lastSeenAt: "now" });
  addFlare.mockResolvedValue({ ok: true });
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

describe("repostWantsAction", () => {
  const fields = { code: "K3M9PZ" };

  it("posts every saved want into the room", async () => {
    listWants.mockResolvedValue([want("w1", "c1", "RG Luffy"), want("w2", "c2")]);

    const state = await repostWantsAction(REPOST_IDLE, form(fields));

    expect(state).toEqual({ status: "posted", count: 2 });
    expect(addFlare).toHaveBeenCalledTimes(2);
    // The deck label re-posts with the want, so the folder survives the trip.
    expect(addFlare).toHaveBeenCalledWith("event-1", "sess-1", {
      cardId: "c1",
      printingId: null,
      quantity: 1,
      note: null,
      deckLabel: "RG Luffy",
    });
    expect(linkSessionToPlayer).toHaveBeenCalledWith("sess-1", "player-1");
  });

  it("posts nothing for a guest with no account", async () => {
    getViewer.mockResolvedValue({ kind: "anonymous" });

    const state = await repostWantsAction(REPOST_IDLE, form(fields));

    expect(state.status).toBe("error");
    expect(addFlare).not.toHaveBeenCalled();
  });

  it("posts nothing without room membership", async () => {
    findParticipation.mockResolvedValue(null);

    const state = await repostWantsAction(REPOST_IDLE, form(fields));

    expect(state.status).toBe("error");
    expect(addFlare).not.toHaveBeenCalled();
  });

  it("stops at the Flare cap instead of hammering it", async () => {
    addFlare
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, reason: "at-cap" });

    const state = await repostWantsAction(REPOST_IDLE, form(fields));

    expect(state).toEqual({ status: "posted", count: 1 });
    expect(addFlare).toHaveBeenCalledTimes(2);
  });

  it("resolves the account for an admin who also plays", async () => {
    getViewer.mockResolvedValue({ kind: "admin", user: { id: "a1" }, storeIds: [] });
    playerForUser.mockResolvedValue({ id: "player-9" });

    const state = await repostWantsAction(REPOST_IDLE, form(fields));

    expect(state.status).toBe("posted");
    expect(listWants).toHaveBeenCalledWith("player-9");
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
    addFlare.mockResolvedValue({ ok: true });

    await expect(rsvpAction(form({ code: "K3M9PZ" }))).rejects.toThrow("NEXT_REDIRECT");

    expect(joinEvent).toHaveBeenCalledWith("event-1", "sess-1");
    expect(addFlare).toHaveBeenCalledTimes(2);
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

  it("refuses a board outside its early window", async () => {
    enterRoomByCode.mockResolvedValue({
      ...earlyEvent(),
      startsAt: new Date(Date.now() + 100 * HOUR).toISOString(),
      endsAt: new Date(Date.now() + 104 * HOUR).toISOString(),
    });

    await rsvpAction(form({ code: "K3M9PZ" }));

    expect(joinEvent).not.toHaveBeenCalled();
    expect(addFlare).not.toHaveBeenCalled();
  });

  it("is a silent no-op for anyone without a player account", async () => {
    getViewer.mockResolvedValue({ kind: "anonymous" });

    await rsvpAction(form({ code: "K3M9PZ" }));

    expect(enterRoomByCode).not.toHaveBeenCalled();
  });
});
