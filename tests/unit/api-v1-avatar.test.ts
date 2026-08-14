import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The chunked avatar upload: begin hands out an id, chunks land in the
 * bucket as text, commit stitches them in order, decodes once, and
 * hands the bytes to the same setAvatar pipeline the website uses.
 * The transport exists because the app cannot send request bodies on
 * some networks, so correctness here is what "change your picture in
 * the app" actually rests on.
 */

const getUser = vi.fn();
const playerForUser = vi.fn();
const setAvatar = vi.fn();

const storage = {
  upload: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
};

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    auth: { getUser: (token: string) => getUser(token) },
    storage: { from: () => storage },
  }),
}));

vi.mock("@/lib/players/accounts", () => ({
  playerForUser: (id: string) => playerForUser(id),
}));

vi.mock("@/lib/players/profile", () => ({
  setAvatar: (playerId: string, file: unknown) => setAvatar(playerId, file),
}));

const route = await import("@/app/api/v1/avatar/route");

function request(payload: unknown, token: string | null = "jwt-1"): Request {
  return new Request("https://cardflare.gg/api/v1/avatar", {
    method: "POST",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "x-cf-payload": encodeURIComponent(JSON.stringify(payload)),
    },
  });
}

beforeEach(() => {
  for (const fn of [getUser, playerForUser, setAvatar, ...Object.values(storage)]) {
    fn.mockReset();
  }
  getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  playerForUser.mockResolvedValue({ id: "player-1", display_name: "Kaito" });
  storage.upload.mockResolvedValue({ error: null });
  storage.remove.mockResolvedValue({ error: null });
  setAvatar.mockResolvedValue({ ok: true, path: "player-1/1.jpg" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/v1/avatar", () => {
  it("answers 401 without a bearer token", async () => {
    const response = await route.POST(request({ action: "begin" }, null));
    expect(response.status).toBe(401);
  });

  it("begin hands out a fresh upload id", async () => {
    const response = await route.POST(request({ action: "begin" }));
    expect(response.status).toBe(200);
    const { uploadId } = (await response.json()) as { uploadId: string };
    expect(uploadId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects a chunk that is not base64 text", async () => {
    const response = await route.POST(
      request({
        action: "chunk",
        uploadId: "8b7df143-d91c-4396-a527-9a341b3c295d",
        index: 0,
        data: "not base64!!",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("stores a chunk under the player's own tmp path", async () => {
    const response = await route.POST(
      request({
        action: "chunk",
        uploadId: "8b7df143-d91c-4396-a527-9a341b3c295d",
        index: 2,
        data: "aGVsbG8=",
      }),
    );
    expect(response.status).toBe(200);
    expect(storage.upload).toHaveBeenCalledWith(
      "tmp/player-1/8b7df143-d91c-4396-a527-9a341b3c295d/002",
      expect.anything(),
      expect.objectContaining({ upsert: true }),
    );
  });

  it("commit stitches the chunks in order and feeds setAvatar", async () => {
    /* "hello world" split across two text chunks. */
    const whole = Buffer.from("hello world").toString("base64");
    const pieces = [whole.slice(0, 8), whole.slice(8)];
    storage.download
      .mockResolvedValueOnce({ data: { text: async () => pieces[0] }, error: null })
      .mockResolvedValueOnce({ data: { text: async () => pieces[1] }, error: null });

    const response = await route.POST(
      request({
        action: "commit",
        uploadId: "8b7df143-d91c-4396-a527-9a341b3c295d",
        count: 2,
      }),
    );

    expect(response.status).toBe(200);
    const [playerId, file] = setAvatar.mock.calls[0] as [
      string,
      { arrayBuffer(): Promise<ArrayBuffer>; size: number; type: string },
    ];
    expect(playerId).toBe("player-1");
    expect(file.type).toBe("image/jpeg");
    expect(Buffer.from(await file.arrayBuffer()).toString()).toBe("hello world");

    /* The tmp pieces are cleaned up whatever happened. */
    expect(storage.remove).toHaveBeenCalledWith([
      "tmp/player-1/8b7df143-d91c-4396-a527-9a341b3c295d/000",
      "tmp/player-1/8b7df143-d91c-4396-a527-9a341b3c295d/001",
    ]);
  });

  it("commit refuses when a piece is missing, and still cleans up", async () => {
    storage.download.mockResolvedValue({ data: null, error: { message: "gone" } });

    const response = await route.POST(
      request({
        action: "commit",
        uploadId: "8b7df143-d91c-4396-a527-9a341b3c295d",
        count: 3,
      }),
    );

    expect(response.status).toBe(400);
    expect(setAvatar).not.toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalled();
  });

  it("surfaces an unreadable picture as the player's problem to retry", async () => {
    const whole = Buffer.from("junk").toString("base64");
    storage.download.mockResolvedValue({
      data: { text: async () => whole },
      error: null,
    });
    setAvatar.mockResolvedValue({ ok: false, reason: "unreadable" });

    const response = await route.POST(
      request({
        action: "commit",
        uploadId: "8b7df143-d91c-4396-a527-9a341b3c295d",
        count: 1,
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("could not be read");
  });
});
