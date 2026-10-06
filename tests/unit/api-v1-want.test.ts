import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetApiPlayerMemory } from "@/lib/api/auth";

/**
 * Editing one saved want from the app.
 *
 * The re-post panel can now change a quantity and drop an ask, which
 * means two more public endpoints keyed by an id somebody else could
 * guess. What is pinned here is that ownership rides on the write, that
 * a delta is a delta rather than an absolute, and that a want belonging
 * to another player resolves to nothing at all.
 */

const getUser = vi.fn();
const playerForUser = vi.fn();
const removeWant = vi.fn();
const adjustWantQuantity = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    auth: { getUser: (...a: unknown[]) => getUser(...a) },
  }),
}));
vi.mock("@/lib/players/accounts", () => ({
  playerForUser: (...a: unknown[]) => playerForUser(...a),
}));
vi.mock("@/lib/players/wants", () => ({
  removeWant: (...a: unknown[]) => removeWant(...a),
  adjustWantQuantity: (...a: unknown[]) => adjustWantQuantity(...a),
}));
/* The post following the number is the found rule's job, pinned in
   found-everywhere.test.ts; here it only has to be reachable. */
vi.mock("@/lib/players/found", () => ({
  syncCardQuantity: async () => undefined,
}));

const route = await import("@/app/api/v1/wants/[id]/route");

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function request(
  method: string,
  body?: unknown,
  token: string | null = "jwt-1",
): Request {
  return new Request("https://cardflare.gg/api/v1/wants/w1", {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  /* apiPlayer remembers a token for two minutes; every case here fakes
     a different answer for the same token. */
  resetApiPlayerMemory();
  for (const fn of [getUser, playerForUser, removeWant, adjustWantQuantity]) {
    fn.mockReset();
  }
  getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  playerForUser.mockResolvedValue({ id: "player-1", display_name: "Kaito" });
  adjustWantQuantity.mockImplementation(async (id: string, _p: string, delta: number) =>
    id === "w1"
      ? { ok: true, quantity: 2 + delta, cardId: "card-1" }
      : { ok: false, reason: "not-found" },
  );
});

describe("POST /api/v1/wants/[id]", () => {
  it("hands the delta to the database and answers with the stored result", async () => {
    const response = await route.POST(request("POST", { delta: 1 }), params("w1"));

    expect(adjustWantQuantity).toHaveBeenCalledWith("w1", "player-1", 1);
    expect(await response.json()).toEqual({ ok: true, quantity: 3 });
  });

  it("subtracts as readily as it adds", async () => {
    await route.POST(request("POST", { delta: -1 }), params("w1"));

    expect(adjustWantQuantity).toHaveBeenCalledWith("w1", "player-1", -1);
  });

  /* A failed write is an error, never a number nobody stored. */
  it("answers a failed write with an error, not success", async () => {
    adjustWantQuantity.mockResolvedValueOnce({ ok: false, reason: "unavailable" });
    const response = await route.POST(request("POST", { delta: 1 }), params("w1"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "unavailable" });
  });

  /* The founder's network eats POST bodies; the header is the way in. */
  it("reads the delta from the payload header when there is no body", async () => {
    const headed = new Request("https://cardflare.gg/api/v1/wants/w1", {
      method: "POST",
      headers: {
        authorization: "Bearer jwt-1",
        "x-cf-payload": encodeURIComponent(JSON.stringify({ delta: 1 })),
      },
    });

    await route.POST(headed, params("w1"));

    expect(adjustWantQuantity).toHaveBeenCalledWith("w1", "player-1", 1);
  });

  it("refuses a request with no bearer token", async () => {
    const response = await route.POST(
      request("POST", { delta: 1 }, null),
      params("w1"),
    );

    expect(response.status).toBe(401);
    expect(adjustWantQuantity).not.toHaveBeenCalled();
  });

  it("refuses a delta that is missing, zero, or not a number", async () => {
    for (const delta of [undefined, 0, "banana"]) {
      const response = await route.POST(request("POST", { delta }), params("w1"));
      expect(response.status).toBe(400);
    }

    expect(adjustWantQuantity).not.toHaveBeenCalled();
  });

  it("changes nothing for a want the player does not own", async () => {
    const response = await route.POST(
      request("POST", { delta: 1 }),
      params("someones"),
    );

    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/v1/wants/[id]", () => {
  it("removes only through the signed-in player", async () => {
    const response = await route.DELETE(request("DELETE"), params("w1"));

    expect(removeWant).toHaveBeenCalledWith("w1", "player-1");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("refuses a request with no bearer token", async () => {
    const response = await route.DELETE(
      request("DELETE", undefined, null),
      params("w1"),
    );

    expect(response.status).toBe(401);
    expect(removeWant).not.toHaveBeenCalled();
  });
});
