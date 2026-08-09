import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The offer actions re-establish the whole chain themselves — session, room,
 * membership — because a Server Action is a public POST endpoint and the
 * flare id in the form proves nothing. Same shape as the open-to-trades
 * action's tests, because it is the same threat model.
 */

const getPlayerSession = vi.fn();
const resolveCode = vi.fn();
const findParticipation = vi.fn();
const offerTrade = vi.fn();
const withdrawOffer = vi.fn();
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
vi.mock("@/lib/notifications/notify", () => ({
  notifyOfferReceived: vi.fn(),
  notifyTradeConfirmed: vi.fn(),
}));
vi.mock("@/lib/matching/repository", () => ({
  offerTrade: (...a: unknown[]) => offerTrade(...a),
  withdrawOffer: (...a: unknown[]) => withdrawOffer(...a),
}));

const { offerTradeAction, withdrawOfferAction } =
  await import("@/lib/matching/actions");
const { resetRateLimits } = await import("@/lib/rate-limit");

const SESSION = { id: "holder-1", display_name: "Kaito" };
const ROOM = { id: "room-1" };

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function offer(fields: Record<string, string> = {}) {
  try {
    await offerTradeAction(
      form({ code: "K3M9PZ", flareId: "flare-1", message: "table 12", ...fields }),
    );
  } catch (error) {
    const message = (error as Error).message;
    if (!message.startsWith("REDIRECT:")) throw error;
  }
}

async function withdraw(fields: Record<string, string> = {}) {
  try {
    await withdrawOfferAction(form({ code: "K3M9PZ", flareId: "flare-1", ...fields }));
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
    offerTrade,
    withdrawOffer,
    redirect,
  ]) {
    fn.mockReset();
  }

  resetRateLimits();
  getPlayerSession.mockResolvedValue(SESSION);
  resolveCode.mockResolvedValue({ outcome: "room", room: ROOM });
  findParticipation.mockResolvedValue({ joinedAt: "", lastSeenAt: "" });
  offerTrade.mockResolvedValue({ ok: true });
  withdrawOffer.mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("offerTradeAction", () => {
  it("offers as the cookie's session, in the room the code resolves to", async () => {
    await offer();

    expect(offerTrade).toHaveBeenCalledWith(
      "flare-1",
      "room-1",
      "holder-1",
      "table 12",
      1,
    );
  });

  it("carries the pledged count through", async () => {
    await offer({ quantity: "2" });

    expect(offerTrade).toHaveBeenCalledWith(
      "flare-1",
      "room-1",
      "holder-1",
      "table 12",
      2,
    );
  });

  it("treats a mangled count as one copy, never a refusal", async () => {
    await offer({ quantity: "lots" });

    expect(offerTrade).toHaveBeenCalledWith(
      "flare-1",
      "room-1",
      "holder-1",
      "table 12",
      1,
    );
  });

  /*
   * The note is a nicety and the offer is the point: a message that fails
   * validation costs the message, never the offer.
   */
  it("drops a malformed message rather than the offer", async () => {
    await offer({ message: "evil‮text" });

    expect(offerTrade).toHaveBeenCalledWith("flare-1", "room-1", "holder-1", null, 1);
  });

  it("sends no message as null", async () => {
    await offer({ message: "" });

    expect(offerTrade).toHaveBeenCalledWith("flare-1", "room-1", "holder-1", null, 1);
  });

  it("ignores a session id smuggled into the form", async () => {
    await offer({ responderSessionId: "victim-9" });

    expect(offerTrade).toHaveBeenCalledWith(
      "flare-1",
      "room-1",
      "holder-1",
      "table 12",
      1,
    );
  });

  it.each([
    ["no session", () => getPlayerSession.mockResolvedValue(null)],
    ["no room", () => resolveCode.mockResolvedValue({ outcome: "not-found" })],
    ["not in the room", () => findParticipation.mockResolvedValue(null)],
  ])("writes nothing with %s", async (_label, arrange) => {
    arrange();

    await offer();

    expect(offerTrade).not.toHaveBeenCalled();
  });

  it("writes nothing for a malformed code", async () => {
    await offer({ code: "not a code!!" });

    expect(offerTrade).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("stops at the rate limit", async () => {
    for (let i = 0; i < 60; i += 1) await offer();
    offerTrade.mockClear();

    await offer();

    expect(offerTrade).not.toHaveBeenCalled();
  });
});

describe("withdrawOfferAction", () => {
  it("withdraws the cookie's own offer", async () => {
    await withdraw();

    expect(withdrawOffer).toHaveBeenCalledWith("flare-1", "holder-1");
  });

  it("withdraws nothing for someone not in the room", async () => {
    findParticipation.mockResolvedValue(null);

    await withdraw();

    expect(withdrawOffer).not.toHaveBeenCalled();
  });
});
