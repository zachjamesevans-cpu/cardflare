import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The remote: the phone's read of the wall and its presses on it.
 *
 * Two routes and one shared control path, and the properties worth
 * holding are about who may press and what a press writes. Held at
 * the source where a behaviour would need the whole Next runtime to
 * exercise, and run where it does not.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../../", path), "utf8");

describe("the hub route", () => {
  const route = read("src/app/api/v1/stores/[storeId]/hub/route.ts");

  it("admits any role at the store and nobody else", () => {
    expect(route).toContain("apiStoreRole(player.userId, storeId)");
    expect(route).toContain("if (role === null)");
    expect(route).toContain('{ error: "forbidden" }, { status: 403 }');
  });

  it("only answers GET", () => {
    expect(route).toContain("export async function GET");
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(route).not.toContain(`export async function ${method}`);
    }
  });
});

describe("the timers route", () => {
  const route = read("src/app/api/v1/timers/[timerId]/route.ts");

  it("rejects a word that is not a remote op with 400", () => {
    expect(route).toContain("if (!isRemoteOp(op)) return badRequest(");
    /* Before any row is read: a bad op costs nothing. */
    expect(route.indexOf("isRemoteOp(op)")).toBeLessThan(route.indexOf("findTimer("));
  });

  it("walks display-first: timer, its display, then the role at that store", () => {
    const timer = route.indexOf("await findTimer(timerId)");
    const display = route.indexOf("await findDisplay(timer.displayId)");
    const role = route.indexOf("apiStoreRole(player.userId, display.storeId)");
    const press = route.indexOf("await controlTimer(");

    expect(timer).toBeGreaterThan(0);
    expect(display).toBeGreaterThan(timer);
    expect(role).toBeGreaterThan(display);
    expect(press).toBeGreaterThan(role);
    expect(route).toContain('{ error: "forbidden" }, { status: 403 }');
  });

  it("stamps the press with the player's own name", () => {
    expect(route).toContain("player.displayName,");
  });
});

describe("the wire the app carries", () => {
  it("is the same file apart from the import line", () => {
    const [, ...site] = read("src/lib/event-hub/remote-wire.ts").split("\n");
    const [, ...app] = read("mobile/src/remote-wire.ts").split("\n");

    expect(app).toEqual(site);
  });
});

/* -------------------------------------------------------------------- */
/* controlTimer, run.                                                   */
/* -------------------------------------------------------------------- */

const patchTimer = vi.fn();
const patchTimerIfUnchanged = vi.fn();
const logTimerEvent = vi.fn();

vi.mock("@/lib/event-hub/repository", () => ({
  patchTimer: (...a: unknown[]) => patchTimer(...a),
  patchTimerIfUnchanged: (...a: unknown[]) => patchTimerIfUnchanged(...a),
  logTimerEvent: (...a: unknown[]) => logTimerEvent(...a),
}));

const { controlTimer } = await import("@/lib/event-hub/control");

const DISPLAY = {
  id: "display-1",
  storeId: "store-1",
  name: "Main display",
  nightTitle: null,
  token: "a".repeat(32),
  layout: "auto",
  announcement: null,
  showFlares: true,
  showQr: true,
  soundEnabled: false,
};

const TIMER = {
  id: "timer-1",
  displayId: "display-1",
  position: 0,
  game: "one-piece",
  eventName: "Store Tournament",
  round: 1,
  format: null,
  bracket: "swiss",
  presetId: "store-tournament",
  durationSeconds: 2100,
  status: "ready",
  startedAt: null,
  pausedAt: null,
  remainingMsWhenPaused: null,
  overtimeStartedAt: null,
  overtimeDurationSeconds: null,
  overtimeTurn: 0,
  rulesDismissed: false,
  beginnerMode: false,
  autoMode: false,
  autoStart: true,
  intermissionSeconds: 180,
  intermissionExtendedMs: 0,
  autoHeldAt: null,
  timeCalledAt: null,
  controlledBy: null,
  controlledAt: null,
  updatedAt: new Date().toISOString(),
} as const;

describe("controlTimer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    patchTimer.mockResolvedValue(true);
    patchTimerIfUnchanged.mockResolvedValue(null);
  });

  it("records who pressed, and when, on every write", async () => {
    const landed = await controlTimer(
      { timer: TIMER as never, display: DISPLAY as never },
      "start",
      {},
      "Zach",
    );

    expect(landed).toBe(true);
    expect(patchTimer).toHaveBeenCalledWith(
      "timer-1",
      expect.objectContaining({
        status: "running",
        controlledBy: "Zach",
        controlledAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }),
    );
  });

  it("writes nothing, and stamps nobody, for a press that changes nothing", async () => {
    const landed = await controlTimer(
      {
        timer: {
          ...TIMER,
          status: "running",
          startedAt: new Date().toISOString(),
        } as never,
        display: DISPLAY as never,
      },
      "start",
      {},
      "Zach",
    );

    expect(landed).toBe(false);
    expect(patchTimer).not.toHaveBeenCalled();
    expect(patchTimerIfUnchanged).not.toHaveBeenCalled();
  });

  it("refuses a word it does not have", async () => {
    const landed = await controlTimer(
      { timer: TIMER as never, display: DISPLAY as never },
      "delete-everything",
      {},
      "Zach",
    );

    expect(landed).toBe(false);
    expect(patchTimer).not.toHaveBeenCalled();
  });

  it("guards the manual next round on the row as read, stamped", async () => {
    patchTimerIfUnchanged.mockResolvedValue({ ...TIMER, round: 2 });

    const landed = await controlTimer(
      {
        timer: {
          ...TIMER,
          status: "time_called",
          startedAt: new Date(Date.now() - 2_100_000).toISOString(),
        } as never,
        display: DISPLAY as never,
      },
      "next-round",
      {},
      "Console",
    );

    expect(landed).toBe(true);
    expect(patchTimerIfUnchanged).toHaveBeenCalledWith(
      "timer-1",
      TIMER.updatedAt,
      expect.objectContaining({ controlledBy: "Console" }),
    );
    expect(patchTimer).not.toHaveBeenCalled();
  });

  it("maps the stamp to the row's columns", () => {
    const repository = read("src/lib/event-hub/repository.ts");
    expect(repository).toContain("controlled_by: patch.controlledBy");
    expect(repository).toContain("controlled_at: patch.controlledAt");
    expect(repository).toContain("controlledBy: row.controlled_by");
  });
});
