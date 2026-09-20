import { beforeEach, describe, expect, it, vi } from "vitest";

const getPlayerSession = vi.fn();
const findEventByJoinCode = vi.fn();
const findParticipation = vi.fn();
const cancelFlare = vi.fn();
const removeFromBinder = vi.fn();

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
  cancelFlare: (...a: unknown[]) => cancelFlare(...a),
  removeFromBinder: (...a: unknown[]) => removeFromBinder(...a),
}));

const { removeListEntryAction } = await import("@/lib/lists/actions");
const { resetRateLimits } = await import("@/lib/rate-limit");

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  resetRateLimits();
  getPlayerSession.mockReset().mockResolvedValue(SESSION);
  findEventByJoinCode.mockReset().mockResolvedValue(EVENT);
  findParticipation.mockReset().mockResolvedValue({ joinedAt: "", lastSeenAt: "" });
  cancelFlare.mockReset().mockResolvedValue(true);
  removeFromBinder.mockReset().mockResolvedValue(true);
});

/*
 * A Server Action is a public POST endpoint. Rendering the button inside a
 * room a player has joined proves nothing about who is calling this.
 */
describe("removeListEntryAction", () => {
  const remove = (kind: string) =>
    removeListEntryAction(formData({ code: "K3M9PZ", kind, entryId: "entry-1" }));

  it("cancels a Flare against the caller's own session", async () => {
    await remove("flare");

    expect(cancelFlare).toHaveBeenCalledWith("entry-1", SESSION.id);
    expect(removeFromBinder).not.toHaveBeenCalled();
  });

  it("removes a binder card against the caller's own session", async () => {
    await remove("have");

    expect(removeFromBinder).toHaveBeenCalledWith("entry-1", SESSION.id);
    expect(cancelFlare).not.toHaveBeenCalled();
  });

  /*
   * Knowing an id must not be authority to pull someone else's Flare off a
   * public board, or to empty their binder. The scoping lives in the
   * repository; this is the guard that it is always given the caller's own
   * session to scope by.
   */
  it("does nothing for someone who is not in the room", async () => {
    findParticipation.mockResolvedValue(null);

    await remove("flare");
    await remove("have");

    expect(cancelFlare).not.toHaveBeenCalled();
    expect(removeFromBinder).not.toHaveBeenCalled();
  });

  it("does nothing for someone with no player session", async () => {
    getPlayerSession.mockResolvedValue(null);

    await remove("flare");

    expect(cancelFlare).not.toHaveBeenCalled();
  });

  it("does nothing for a code that resolves to no event", async () => {
    findEventByJoinCode.mockResolvedValue(null);

    await remove("flare");

    expect(cancelFlare).not.toHaveBeenCalled();
  });

  it("ignores a kind it does not recognise", async () => {
    await remove("need");

    expect(cancelFlare).not.toHaveBeenCalled();
    expect(removeFromBinder).not.toHaveBeenCalled();
  });
});
