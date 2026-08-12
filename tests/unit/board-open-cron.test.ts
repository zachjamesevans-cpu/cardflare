import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The doorbell's clock.
 *
 * Everything else in CardFlare fires off traffic; this route is the one
 * scheduled thing, so what must hold is: the secret gate fails closed
 * (no CRON_SECRET configured means no run at all, not an open
 * endpoint), and only boards the shared open-time rule calls open get
 * rung — including a board whose hours window is shut but whose event
 * day has started, the midnight leg.
 */

type Response = Record<string, unknown>;

function chain(response: Response) {
  const c: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "gt", "lte"]) {
    c[method] = vi.fn(() => c);
  }
  c.maybeSingle = () => Promise.resolve(response);
  c.then = (resolve: (v: Response) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(response).then(resolve, reject);
  return c;
}

const queues: Record<string, Response[]> = {};

function queue(table: string, ...responses: Response[]) {
  (queues[table] ??= []).push(...responses);
}

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: (table: string) =>
      chain(queues[table]?.shift() ?? { data: null, error: null }),
  }),
}));

const notifyBoardOpen = vi.fn();
vi.mock("@/lib/notifications/notify", () => ({
  notifyBoardOpen: (...a: unknown[]) => notifyBoardOpen(...a),
}));

const route = await import("@/app/api/cron/board-open/route");

function request(token?: string): Request {
  return new Request("https://cardflare.gg/api/cron/board-open", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  for (const key of Object.keys(queues)) delete queues[key];
  notifyBoardOpen.mockReset();
  vi.stubEnv("CRON_SECRET", "cron-secret-1");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/cron/board-open", () => {
  it("refuses without the secret, and refuses the wrong one", async () => {
    expect((await route.GET(request())).status).toBe(401);
    expect((await route.GET(request("wrong"))).status).toBe(401);
    expect(notifyBoardOpen).not.toHaveBeenCalled();
  });

  it("fails closed when no secret is configured at all", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await route.GET(request(""));

    expect(response.status).toBe(401);
    expect(notifyBoardOpen).not.toHaveBeenCalled();
  });

  it("rings only the boards the shared rule calls open", async () => {
    const now = Date.now();
    const HOUR = 60 * 60 * 1000;

    queue("events", {
      data: [
        // Opened by the hours window: starts in 24h, window 48h.
        {
          id: "e-open",
          starts_at: new Date(now + 24 * HOUR).toISOString(),
          store_id: "s1",
        },
        // Not open: starts in 6 days, window 48h, not event day yet.
        {
          id: "e-far",
          starts_at: new Date(now + 144 * HOUR).toISOString(),
          store_id: "s1",
        },
      ],
      error: null,
    });
    queue("stores", {
      data: [{ id: "s1", early_board_hours: 48, timezone: "UTC" }],
      error: null,
    });

    const response = await route.GET(request("cron-secret-1"));

    expect(await response.json()).toEqual({ ok: true, checked: 2, open: 1 });
    expect(notifyBoardOpen).toHaveBeenCalledTimes(1);
    expect(notifyBoardOpen).toHaveBeenCalledWith("e-open");
  });

  it("rings a board on event day even when the hours window is shut", async () => {
    const now = Date.parse("2026-08-14T09:00:00Z");
    vi.spyOn(Date, "now").mockReturnValue(now);

    queue("events", {
      data: [
        // 6pm event, 6-hour window (noon). At 9am the midnight leg has it open.
        { id: "e-midnight", starts_at: "2026-08-14T18:00:00.000Z", store_id: "s1" },
      ],
      error: null,
    });
    queue("stores", {
      data: [{ id: "s1", early_board_hours: 6, timezone: "UTC" }],
      error: null,
    });

    const response = await route.GET(request("cron-secret-1"));

    expect(await response.json()).toEqual({ ok: true, checked: 1, open: 1 });
    expect(notifyBoardOpen).toHaveBeenCalledWith("e-midnight");
  });

  it("rings nothing for a store with early boards off", async () => {
    const now = Date.now();

    queue("events", {
      data: [
        {
          id: "e-1",
          starts_at: new Date(now + 60 * 60 * 1000).toISOString(),
          store_id: "s1",
        },
      ],
      error: null,
    });
    queue("stores", {
      data: [{ id: "s1", early_board_hours: 0, timezone: "UTC" }],
      error: null,
    });

    const response = await route.GET(request("cron-secret-1"));

    expect(await response.json()).toEqual({ ok: true, checked: 1, open: 0 });
    expect(notifyBoardOpen).not.toHaveBeenCalled();
  });
});
