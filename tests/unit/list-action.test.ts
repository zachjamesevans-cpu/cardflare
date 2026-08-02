import { beforeEach, describe, expect, it, vi } from "vitest";

const getPlayerSession = vi.fn();
const findEventByJoinCode = vi.fn();
const findParticipation = vi.fn();
const addEntry = vi.fn();
const cancelEntry = vi.fn();

const CARD = "11111111-1111-1111-1111-111111111111";
const SESSION = { id: "33333333-3333-3333-3333-333333333333", display_name: "Zach" };
const EVENT = { id: "44444444-4444-4444-4444-444444444444", name: "Friday" };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// `clientKey` reads request headers for the rate limiter, and there is no
// request scope in a unit test.
vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => "203.0.113.7" }),
}));

vi.mock("@/lib/players/session", () => ({
  getPlayerSession: () => getPlayerSession(),
}));
vi.mock("@/lib/events/repository", () => ({
  findEventByJoinCode: (...a: unknown[]) => findEventByJoinCode(...a),
}));
vi.mock("@/lib/events/participants", () => ({
  findParticipation: (...a: unknown[]) => findParticipation(...a),
}));
vi.mock("@/lib/lists/repository", () => ({
  addEntry: (...a: unknown[]) => addEntry(...a),
  cancelEntry: (...a: unknown[]) => cancelEntry(...a),
}));

const { addToListAction, cancelListEntryAction } = await import("@/lib/lists/actions");
const { LIST_IDLE } = await import("@/lib/lists/schema");
const { resetRateLimits } = await import("@/lib/rate-limit");

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const add = (fields: Record<string, string> = {}) =>
  addToListAction(
    LIST_IDLE,
    formData({ code: "K3M9PZ", kind: "flare", cardId: CARD, ...fields }),
  );

beforeEach(() => {
  resetRateLimits();
  getPlayerSession.mockReset().mockResolvedValue(SESSION);
  findEventByJoinCode.mockReset().mockResolvedValue(EVENT);
  findParticipation.mockReset().mockResolvedValue({ joinedAt: "", lastSeenAt: "" });
  addEntry.mockReset().mockResolvedValue({ ok: true });
  cancelEntry.mockReset().mockResolvedValue(true);
});

/*
 * A Server Action is a public POST endpoint. Rendering the form inside a room
 * a player has joined proves nothing about who is calling this.
 */
describe("posting to a list requires being in the room", () => {
  it("refuses someone with no player session", async () => {
    getPlayerSession.mockResolvedValue(null);

    expect((await add()).status).toBe("error");
    expect(addEntry).not.toHaveBeenCalled();
  });

  it("refuses a code that resolves to no event", async () => {
    findEventByJoinCode.mockResolvedValue(null);

    expect((await add()).status).toBe("error");
    expect(addEntry).not.toHaveBeenCalled();
  });

  /* The one that matters: a real session, a real room, but not a member. */
  it("refuses a player who has not joined this room", async () => {
    findParticipation.mockResolvedValue(null);

    expect((await add()).status).toBe("error");
    expect(addEntry).not.toHaveBeenCalled();
  });

  it("writes against the session's own id, never one from the form", async () => {
    await add({ playerSessionId: "99999999-9999-9999-9999-999999999999" });

    expect(addEntry).toHaveBeenCalledWith(
      EVENT.id,
      SESSION.id,
      "flare",
      expect.anything(),
    );
  });
});

describe("addToListAction", () => {
  it("posts a Flare for any printing by default", async () => {
    const state = await add();

    expect(state.status).toBe("added");
    expect(addEntry.mock.calls[0]![3]).toMatchObject({
      cardId: CARD,
      printingId: null,
      quantity: 1,
    });
  });

  it("adds to the Have list when asked to", async () => {
    await add({ kind: "have" });

    expect(addEntry.mock.calls[0]![2]).toBe("have");
  });

  it("refuses a kind it does not recognise", async () => {
    expect((await add({ kind: "need" })).status).toBe("error");
    expect(addEntry).not.toHaveBeenCalled();
  });

  it("refuses a card id that is not one", async () => {
    expect((await add({ cardId: "OP01-024" })).status).toBe("error");
    expect(addEntry).not.toHaveBeenCalled();
  });

  /* The cap has to be explained, or a silent failure looks like a bug. */
  it("says which cap was hit", async () => {
    addEntry.mockResolvedValue({ ok: false, reason: "at-cap" });

    const state = await add();

    expect(state.status).toBe("error");
    expect(state.status === "error" && state.message).toMatch(/flares/i);
  });

  it("does not leak internals when the write fails", async () => {
    addEntry.mockResolvedValue({ ok: false, reason: "unavailable" });

    const state = await add();

    expect(state.status === "error" && state.message).not.toMatch(
      /supabase|postgres|event_cards/i,
    );
  });

  /*
   * The name is echoed back only so the confirmation can say what was added.
   * The card itself is resolved by id, so a forged name changes nothing.
   */
  it("never uses the card name the client sent for anything but the message", async () => {
    const state = await add({ cardName: "Totally Different Card" });

    expect(state.status === "added" && state.cardName).toBe("Totally Different Card");
    expect(addEntry.mock.calls[0]![3]).toMatchObject({ cardId: CARD });
  });

  it("stops a flood from one network", async () => {
    for (let i = 0; i < 120; i += 1) await add();

    expect((await add()).status).toBe("error");
  });
});

describe("cancelListEntryAction", () => {
  it("cancels against the caller's own session", async () => {
    await cancelListEntryAction(formData({ code: "K3M9PZ", entryId: "entry-1" }));

    expect(cancelEntry).toHaveBeenCalledWith("entry-1", SESSION.id);
  });

  /*
   * Knowing an id must not be authority to pull someone else's Flare off a
   * public board. The scoping lives in the repository; this is the guard that
   * it is always given the caller's own session to scope by.
   */
  it("does nothing for someone who is not in the room", async () => {
    findParticipation.mockResolvedValue(null);

    await cancelListEntryAction(formData({ code: "K3M9PZ", entryId: "entry-1" }));

    expect(cancelEntry).not.toHaveBeenCalled();
  });
});
