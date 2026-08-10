import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The no-room save: the founder's midnight bug was the app posting every
 * Flare into the last room, keeping a closed store's room warm. This
 * route saves straight to the account list and touches no event — so
 * what it must be is bearer-gated, schema-cleaned, and honest at the
 * cap, and each of those is pinned here.
 */

const getUser = vi.fn();
const playerForUser = vi.fn();
const saveWant = vi.fn();

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
  saveWant: (...a: unknown[]) => saveWant(...a),
}));

const wants = await import("@/app/api/v1/wants/route");

const CARD = "11111111-1111-4111-8111-111111111111";

function request(body?: unknown, token: string | null = "jwt-1"): Request {
  return new Request("https://cardflare.gg/api/v1/wants", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  for (const fn of [getUser, playerForUser, saveWant]) fn.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  playerForUser.mockResolvedValue({ id: "player-1", display_name: "Kaito" });
  saveWant.mockResolvedValue("saved");
});

describe("POST /api/v1/wants", () => {
  it("saves a cleaned entry to the signed-in player's list", async () => {
    const response = await wants.POST(
      request({ cardId: CARD, quantity: 2, deckLabel: " RG  Luffy " }),
    );

    expect(response.status).toBe(200);
    expect(saveWant).toHaveBeenCalledWith(
      "player-1",
      expect.objectContaining({ cardId: CARD, quantity: 2, deckLabel: "RG Luffy" }),
    );
  });

  it("refuses without a bearer token", async () => {
    const response = await wants.POST(request({ cardId: CARD, quantity: 1 }, null));

    expect(response.status).toBe(401);
    expect(saveWant).not.toHaveBeenCalled();
  });

  it("refuses an authenticated user with no player account", async () => {
    playerForUser.mockResolvedValue(null);

    const response = await wants.POST(request({ cardId: CARD, quantity: 1 }));

    expect(response.status).toBe(401);
    expect(saveWant).not.toHaveBeenCalled();
  });

  it("refuses a payload without a card", async () => {
    const response = await wants.POST(request({ quantity: 1 }));

    expect(response.status).toBe(400);
    expect(saveWant).not.toHaveBeenCalled();
  });

  it("says so at the cap instead of pretending to save", async () => {
    saveWant.mockResolvedValue("at-cap");

    const response = await wants.POST(request({ cardId: CARD, quantity: 1 }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "at-cap" });
  });
});
