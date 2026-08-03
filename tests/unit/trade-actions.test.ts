import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The confirm action re-establishes the whole chain — session, room,
 * membership — because a Server Action is a public POST endpoint. Same
 * scaffolding as the offer actions; the one extra thing worth pinning is
 * that the requester is always the cookie's session, never a form field.
 */

const getPlayerSession = vi.fn();
const resolveCode = vi.fn();
const findParticipation = vi.fn();
const confirmTrade = vi.fn();
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
}));
vi.mock("@/lib/events/rooms", () => ({
  resolveCode: (...a: unknown[]) => resolveCode(...a),
}));
vi.mock("@/lib/events/participants", () => ({
  findParticipation: (...a: unknown[]) => findParticipation(...a),
}));
vi.mock("@/lib/trades/repository", () => ({
  confirmTrade: (...a: unknown[]) => confirmTrade(...a),
}));

const { confirmTradeAction } = await import("@/lib/trades/actions");
const { resetRateLimits } = await import("@/lib/rate-limit");

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function confirm(fields: Record<string, string> = {}) {
  try {
    await confirmTradeAction(form({ code: "K3M9PZ", flareId: "flare-1", ...fields }));
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
    confirmTrade,
    redirect,
  ]) {
    fn.mockReset();
  }

  resetRateLimits();
  getPlayerSession.mockResolvedValue({ id: "asker-1", display_name: "Zach" });
  resolveCode.mockResolvedValue({ outcome: "room", room: { id: "room-1" } });
  findParticipation.mockResolvedValue({ joinedAt: "", lastSeenAt: "" });
  confirmTrade.mockResolvedValue({ ok: true });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("confirmTradeAction", () => {
  it("confirms as the cookie's session with the named partner", async () => {
    await confirm({ partnerSessionId: "holder-9" });

    expect(confirmTrade).toHaveBeenCalledWith(
      "flare-1",
      "room-1",
      "asker-1",
      "holder-9",
    );
  });

  it("confirms without a partner when none is named", async () => {
    await confirm();

    expect(confirmTrade).toHaveBeenCalledWith("flare-1", "room-1", "asker-1", null);
  });

  it("ignores a requester smuggled into the form", async () => {
    await confirm({ requesterSessionId: "victim-2" });

    expect(confirmTrade).toHaveBeenCalledWith("flare-1", "room-1", "asker-1", null);
  });

  it.each([
    ["no session", () => getPlayerSession.mockResolvedValue(null)],
    ["no room", () => resolveCode.mockResolvedValue({ outcome: "not-found" })],
    ["not in the room", () => findParticipation.mockResolvedValue(null)],
  ])("writes nothing with %s", async (_label, arrange) => {
    arrange();

    await confirm();

    expect(confirmTrade).not.toHaveBeenCalled();
  });

  it("writes nothing for a malformed code", async () => {
    await confirm({ code: "!!!" });

    expect(confirmTrade).not.toHaveBeenCalled();
  });

  it("stops at the rate limit", async () => {
    for (let i = 0; i < 30; i += 1) await confirm();
    confirmTrade.mockClear();

    await confirm();

    expect(confirmTrade).not.toHaveBeenCalled();
  });
});
