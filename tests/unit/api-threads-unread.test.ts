import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET /api/v1/local/threads/unread: the number behind the Messages
 * dot, by itself. The app used to download every conversation to add
 * up their unread counts; this is the one count the website's bar
 * already draws from, behind the same door as the list beside it.
 */

const apiPlayer = vi.fn();
const unreadMessages = vi.fn();

vi.mock("@/lib/api/auth", () => ({
  apiPlayer: (request: Request) => apiPlayer(request),
  unauthorized: () => Response.json({ error: "unauthorized" }, { status: 401 }),
}));

vi.mock("@/lib/local/threads", () => ({
  unreadMessages: (playerId: string) => unreadMessages(playerId),
}));

const route = await import("@/app/api/v1/local/threads/unread/route");

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const request = () =>
  new Request("https://cardflare.gg/api/v1/local/threads/unread", {
    headers: { authorization: "Bearer jwt-1" },
  });

beforeEach(() => {
  apiPlayer.mockReset();
  unreadMessages.mockReset();
});

describe("GET /api/v1/local/threads/unread", () => {
  it("answers the player's unread count and nothing else", async () => {
    apiPlayer.mockResolvedValue({ playerId: "p-1" });
    unreadMessages.mockResolvedValue(3);

    const response = await route.GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ unread: 3 });
    expect(unreadMessages).toHaveBeenCalledWith("p-1");
  });

  it("answers zero as a number, not as nothing", async () => {
    apiPlayer.mockResolvedValue({ playerId: "p-1" });
    unreadMessages.mockResolvedValue(0);

    expect(await (await route.GET(request())).json()).toEqual({ unread: 0 });
  });

  it("refuses a signed-out caller the way the list beside it does", async () => {
    apiPlayer.mockResolvedValue(null);

    const response = await route.GET(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(unreadMessages).not.toHaveBeenCalled();
  });

  it("is built the way its sibling is: never cached, bearer auth, the shared 401", () => {
    const unread = read("src/app/api/v1/local/threads/unread/route.ts");
    const sibling = read("src/app/api/v1/local/threads/route.ts");

    for (const line of [
      'export const dynamic = "force-dynamic";',
      "const player = await apiPlayer(request);",
      "if (!player) return unauthorized();",
    ]) {
      expect(sibling).toContain(line);
      expect(unread).toContain(line);
    }
    expect(unread).toContain("unreadMessages(player.playerId)");
    /* The count, not the conversations. */
    expect(unread).not.toContain("listThreads");
  });
});
