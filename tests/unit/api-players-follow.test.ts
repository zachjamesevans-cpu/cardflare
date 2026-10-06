import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetApiPlayerMemory } from "@/lib/api/auth";

/**
 * The follow toggle: option C's one write. Accounts only, no self
 * edges, and the settled state rides back so buttons never guess.
 */

const getUser = vi.fn();
const playerForUser = vi.fn();
const followPlayer = vi.fn();
const unfollowPlayer = vi.fn();
const followStateFn = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    auth: { getUser: (token: string) => getUser(token) },
  }),
}));

vi.mock("@/lib/players/accounts", () => ({
  playerForUser: (id: string) => playerForUser(id),
}));

vi.mock("@/lib/players/follows", () => ({
  followPlayer: (a: string, b: string) => followPlayer(a, b),
  unfollowPlayer: (a: string, b: string) => unfollowPlayer(a, b),
  followState: (a: string, b: string) => followStateFn(a, b),
}));

vi.mock("@/lib/auth/session", () => ({
  getViewer: async () => ({ kind: "anonymous" }),
}));

vi.mock("@/lib/players/session", () => ({
  getPlayerSession: async () => null,
}));

vi.mock("@/lib/players/profile", () => ({
  publicProfile: async () => null,
}));

vi.mock("@/lib/players/cosmetics", () => ({
  resolveEquipped: async () => ({}),
}));

const route = await import("@/app/api/players/[playerId]/route");

function request(payload: unknown, token: string | null = "jwt-1"): Request {
  return new Request("https://cardflare.gg/api/players/5b3c7a2e-1f4d-4c8a-9e2b-0d6f1a3c5e71", {
    method: "POST",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "x-cf-payload": encodeURIComponent(JSON.stringify(payload)),
    },
  });
}

const params = { params: Promise.resolve({ playerId: "5b3c7a2e-1f4d-4c8a-9e2b-0d6f1a3c5e71" }) };

beforeEach(() => {
  /* apiPlayer remembers a token for two minutes; every case here fakes
     a different answer for the same token. */
  resetApiPlayerMemory();
  for (const fn of [
    getUser,
    playerForUser,
    followPlayer,
    unfollowPlayer,
    followStateFn,
  ]) {
    fn.mockReset();
  }
  getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  playerForUser.mockResolvedValue({ id: "me-1", display_name: "Kaito" });
  followPlayer.mockResolvedValue(true);
  unfollowPlayer.mockResolvedValue(true);
  followStateFn.mockResolvedValue({
    following: true,
    followsYou: false,
    partners: false,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/players/[playerId]", () => {
  it("answers 401 without any identity", async () => {
    const response = await route.POST(request({ action: "follow" }, null), params);
    expect(response.status).toBe(401);
  });

  it("refuses following yourself", async () => {
    playerForUser.mockResolvedValue({ id: "5b3c7a2e-1f4d-4c8a-9e2b-0d6f1a3c5e71", display_name: "Me" });
    const response = await route.POST(request({ action: "follow" }), params);
    expect(response.status).toBe(400);
    expect(followPlayer).not.toHaveBeenCalled();
  });

  it("follows and returns the settled state", async () => {
    const response = await route.POST(request({ action: "follow" }), params);
    expect(response.status).toBe(200);
    expect(followPlayer).toHaveBeenCalledWith("me-1", "5b3c7a2e-1f4d-4c8a-9e2b-0d6f1a3c5e71");
    const body = (await response.json()) as { follow: { following: boolean } };
    expect(body.follow.following).toBe(true);
  });

  it("unfollows through the same door", async () => {
    followStateFn.mockResolvedValue({
      following: false,
      followsYou: true,
      partners: false,
    });
    const response = await route.POST(request({ action: "unfollow" }), params);
    expect(response.status).toBe(200);
    expect(unfollowPlayer).toHaveBeenCalledWith("me-1", "5b3c7a2e-1f4d-4c8a-9e2b-0d6f1a3c5e71");
  });

  it("rejects an unknown action", async () => {
    const response = await route.POST(request({ action: "poke" }), params);
    expect(response.status).toBe(400);
  });

  it("refuses an id that is not a uuid before it reaches anything", async () => {
    const response = await route.POST(request({ action: "follow" }), {
      params: Promise.resolve({ playerId: "x),id.neq.(y" }),
    });
    expect(response.status).toBe(404);
    expect(followPlayer).not.toHaveBeenCalled();
  });
});

describe("GET /api/players/[playerId]", () => {
  it("validates the id and checks the caller before building the profile", async () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/players/[playerId]/route.ts"),
      "utf8",
    );
    const get = source.slice(source.indexOf("export async function GET"));
    expect(get.indexOf("playerIdSchema.safeParse")).toBeGreaterThan(-1);
    const refused = get.indexOf('"Join a room first."');
    expect(refused).toBeGreaterThan(-1);
    expect(refused).toBeLessThan(get.indexOf("publicProfile("));
    expect(refused).toBeLessThan(get.indexOf("dressedEquipsFor("));
  });
});
