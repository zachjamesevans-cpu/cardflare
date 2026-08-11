import { beforeEach, describe, expect, it, vi } from "vitest";

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
const listWants = vi.fn();
const removeWant = vi.fn();
const setWantQuantity = vi.fn();

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
  listWants: (...a: unknown[]) => listWants(...a),
  removeWant: (...a: unknown[]) => removeWant(...a),
  setWantQuantity: (...a: unknown[]) => setWantQuantity(...a),
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
  for (const fn of [getUser, playerForUser, listWants, removeWant, setWantQuantity]) {
    fn.mockReset();
  }
  getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  playerForUser.mockResolvedValue({ id: "player-1", display_name: "Kaito" });
  listWants.mockResolvedValue([{ id: "w1", quantity: 2 }]);
  setWantQuantity.mockResolvedValue(3);
});

describe("POST /api/v1/wants/[id]", () => {
  it("adds the delta to the stored quantity and answers with the result", async () => {
    const response = await route.POST(request("POST", { delta: 1 }), params("w1"));

    expect(setWantQuantity).toHaveBeenCalledWith("w1", "player-1", 3);
    expect(await response.json()).toEqual({ ok: true, quantity: 3 });
  });

  it("subtracts as readily as it adds", async () => {
    await route.POST(request("POST", { delta: -1 }), params("w1"));

    expect(setWantQuantity).toHaveBeenCalledWith("w1", "player-1", 1);
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

    expect(setWantQuantity).toHaveBeenCalledWith("w1", "player-1", 3);
  });

  it("refuses a request with no bearer token", async () => {
    const response = await route.POST(
      request("POST", { delta: 1 }, null),
      params("w1"),
    );

    expect(response.status).toBe(401);
    expect(setWantQuantity).not.toHaveBeenCalled();
  });

  it("refuses a delta that is missing, zero, or not a number", async () => {
    for (const delta of [undefined, 0, "banana"]) {
      const response = await route.POST(request("POST", { delta }), params("w1"));
      expect(response.status).toBe(400);
    }

    expect(setWantQuantity).not.toHaveBeenCalled();
  });

  it("changes nothing for a want the player does not own", async () => {
    const response = await route.POST(
      request("POST", { delta: 1 }),
      params("someones"),
    );

    expect(response.status).toBe(400);
    expect(setWantQuantity).not.toHaveBeenCalled();
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
