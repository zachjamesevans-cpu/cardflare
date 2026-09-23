import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The bearer behind an API request is verified once per token per
 * warm function, not once per request: the founder's "takes a second
 * too long" was, in part, the auth server being asked the same
 * question two or three times per screen.
 */
const getUser = vi.fn();
const playerForUser = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({ auth: { getUser: (token: string) => getUser(token) } }),
}));
vi.mock("@/lib/players/accounts", () => ({
  playerForUser: (id: string) => playerForUser(id),
}));
vi.mock("@/lib/events/participants", () => ({ sessionInEventForPlayer: vi.fn() }));
vi.mock("@/lib/players/repository", () => ({
  findPlayerSession: vi.fn(),
  touchPlayerSession: vi.fn(),
}));
vi.mock("@/lib/players/session", () => ({ hashSessionToken: (t: string) => t }));

const auth = await import("@/lib/api/auth");

const request = (token: string) =>
  new Request("https://cardflare.gg/api/v1/me", {
    headers: { authorization: `Bearer ${token}` },
  });

beforeEach(() => {
  auth.resetApiPlayerMemory();
  getUser.mockReset();
  playerForUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  playerForUser.mockResolvedValue({ id: "p1", display_name: "Zach", handle: "zach" });
});

describe("apiPlayer's memory", () => {
  it("asks the auth server once for a token, then answers from memory", async () => {
    const first = await auth.apiPlayer(request("tok"));
    const second = await auth.apiPlayer(request("tok"));
    expect(first?.playerId).toBe("p1");
    expect(second).toEqual(first);
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(playerForUser).toHaveBeenCalledTimes(1);
  });

  it("keeps tokens apart", async () => {
    await auth.apiPlayer(request("a"));
    await auth.apiPlayer(request("b"));
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it("does not remember a refusal", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "bad" } });
    expect(await auth.apiPlayer(request("tok"))).toBeNull();
    expect(await auth.apiPlayer(request("tok"))).not.toBeNull();
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it("forgets a token on demand, so a rename is not answered from memory", async () => {
    await auth.apiPlayer(request("tok"));
    auth.forgetApiPlayer(request("tok"));
    playerForUser.mockResolvedValue({ id: "p1", display_name: "Zed", handle: "zed" });
    expect((await auth.apiPlayer(request("tok")))?.displayName).toBe("Zed");
  });
});
