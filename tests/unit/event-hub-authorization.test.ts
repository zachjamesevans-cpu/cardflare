import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Who may change what.
 *
 * Two separate questions, and both have bitten products like this one.
 *
 * A store must not be able to drive another store's television, and the
 * id that says which display is a hidden field in a form — something the
 * caller chose. So authorisation is re-established inside the action,
 * from the caller's own session, every time.
 *
 * And the display token must never be a credential. It is read-only by
 * construction rather than by policy: no action accepts it, and the only
 * route that does is a GET.
 */

const getViewer = vi.fn();
const findDisplay = vi.fn();
const findTimer = vi.fn();
const patchTimer = vi.fn();
const updateDisplay = vi.fn();
const addTimer = vi.fn();
const removeTimer = vi.fn();
const reorderTimers = vi.fn();
const listTimers = vi.fn();
const createDisplay = vi.fn();
const editTimer = vi.fn();
const redirect = vi.fn((to: string) => {
  throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: "NEXT_REDIRECT" });
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("@/lib/auth/session", () => ({ getViewer: () => getViewer() }));
vi.mock("@/lib/event-hub/repository", () => ({
  findDisplay: (...a: unknown[]) => findDisplay(...a),
  findTimer: (...a: unknown[]) => findTimer(...a),
  patchTimer: (...a: unknown[]) => patchTimer(...a),
  updateDisplay: (...a: unknown[]) => updateDisplay(...a),
  addTimer: (...a: unknown[]) => addTimer(...a),
  removeTimer: (...a: unknown[]) => removeTimer(...a),
  reorderTimers: (...a: unknown[]) => reorderTimers(...a),
  listTimers: (...a: unknown[]) => listTimers(...a),
  createDisplay: (...a: unknown[]) => createDisplay(...a),
  editTimer: (...a: unknown[]) => editTimer(...a),
}));

const {
  addTimerAction,
  createDisplayAction,
  rotateDisplayTokenAction,
  timerControlAction,
  updateDisplayAction,
} = await import("@/lib/event-hub/actions");

const OWNED = { id: "display-1", storeId: "store-1", token: "a".repeat(32) };

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
  updatedAt: new Date().toISOString(),
};

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  findDisplay.mockResolvedValue(OWNED);
  findTimer.mockResolvedValue(TIMER);
  listTimers.mockResolvedValue([TIMER]);
});

describe("a store acting on its own display", () => {
  beforeEach(() => {
    getViewer.mockResolvedValue({
      kind: "store",
      user: { id: "user-1" },
      storeIds: ["store-1"],
    });
  });

  it("starts a timer", async () => {
    await timerControlAction(form({ timerId: "timer-1", op: "start" }));

    expect(patchTimer).toHaveBeenCalledWith(
      "timer-1",
      expect.objectContaining({ status: "running" }),
    );
  });

  it("writes nothing for a transition that changes nothing", async () => {
    findTimer.mockResolvedValue({
      ...TIMER,
      status: "running",
      startedAt: new Date().toISOString(),
    });

    await timerControlAction(form({ timerId: "timer-1", op: "start" }));

    /* A second staff phone, a double tap, a retried request. None of
       them is an error and none of them is a write. */
    expect(patchTimer).not.toHaveBeenCalled();
  });

  it("refuses an operation it does not have", async () => {
    await timerControlAction(form({ timerId: "timer-1", op: "delete-everything" }));

    expect(patchTimer).not.toHaveBeenCalled();
  });

  it("takes the overtime length from the game's own procedure", async () => {
    findTimer.mockResolvedValue({ ...TIMER, status: "time_called" });

    await timerControlAction(form({ timerId: "timer-1", op: "start-overtime" }));

    /* One Piece Swiss is five minutes. The form has no say in it, so a
       forged field cannot put a fifty-minute overtime on a wall. */
    expect(patchTimer).toHaveBeenCalledWith(
      "timer-1",
      expect.objectContaining({ overtimeDurationSeconds: 300 }),
    );
  });

  it("starts no countdown for a turn-counted procedure", async () => {
    findTimer.mockResolvedValue({
      ...TIMER,
      game: "lorcana",
      presetId: "swiss",
      status: "time_called",
    });

    await timerControlAction(form({ timerId: "timer-1", op: "start-overtime" }));

    expect(patchTimer).toHaveBeenCalledWith(
      "timer-1",
      expect.objectContaining({ overtimeDurationSeconds: null }),
    );
  });
});

describe("a store acting on somebody else's display", () => {
  beforeEach(() => {
    /* A real, signed-in store — just not this one. */
    getViewer.mockResolvedValue({
      kind: "store",
      user: { id: "user-2" },
      storeIds: ["store-2"],
    });
  });

  it("cannot control a timer", async () => {
    await timerControlAction(form({ timerId: "timer-1", op: "start" }));
    expect(patchTimer).not.toHaveBeenCalled();
  });

  it("cannot edit the display", async () => {
    await updateDisplayAction(form({ displayId: "display-1", announcement: "Pizza" }));
    expect(updateDisplay).not.toHaveBeenCalled();
  });

  it("cannot add a tournament", async () => {
    await addTimerAction(
      form({
        displayId: "display-1",
        game: "one-piece",
        eventName: "Theirs",
        round: "",
        format: "",
        bracket: "swiss",
        presetId: "store-tournament",
        customMinutes: "",
      }),
    );

    expect(addTimer).not.toHaveBeenCalled();
  });

  it("cannot rotate the display token", async () => {
    await rotateDisplayTokenAction(form({ displayId: "display-1" }));
    expect(updateDisplay).not.toHaveBeenCalled();
  });

  it("cannot create a display for a store it does not manage", async () => {
    await createDisplayAction(form({ storeId: "store-1", name: "Theirs" }));
    expect(createDisplay).not.toHaveBeenCalled();
  });
});

describe("a player, and nobody at all", () => {
  it("sends an anonymous caller to sign in", async () => {
    getViewer.mockResolvedValue({ kind: "anonymous" });

    await expect(
      timerControlAction(form({ timerId: "timer-1", op: "start" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(patchTimer).not.toHaveBeenCalled();
  });

  it("refuses a player account", async () => {
    getViewer.mockResolvedValue({
      kind: "player",
      user: { id: "user-3" },
      playerId: "p1",
    });

    await timerControlAction(form({ timerId: "timer-1", op: "start" }));

    expect(patchTimer).not.toHaveBeenCalled();
  });

  it("refuses a timer that does not exist", async () => {
    getViewer.mockResolvedValue({
      kind: "store",
      user: { id: "user-1" },
      storeIds: ["store-1"],
    });
    findTimer.mockResolvedValue(null);

    await timerControlAction(form({ timerId: "nope", op: "start" }));

    expect(patchTimer).not.toHaveBeenCalled();
  });
});

/**
 * The token is not a credential, and this is checked at the source
 * rather than through behaviour — because the property worth holding is
 * "no write path accepts it at all", which no single call can prove.
 */
describe("the display token cannot mutate anything", () => {
  const read = (path: string) =>
    readFileSync(resolve(import.meta.dirname, "../../", path), "utf8");

  it("is never read by a Server Action", () => {
    const actions = read("src/lib/event-hub/actions.ts");

    expect(actions).not.toMatch(/text\(formData,\s*"token"\)/);
    expect(actions).not.toMatch(/findDisplayByToken/);
  });

  it("reaches one route, and that route only answers GET", () => {
    const route = read("src/app/api/display/[token]/route.ts");

    expect(route).toContain("export async function GET");
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(route).not.toContain(`export async function ${method}`);
    }
  });

  it("is refused before it reaches the database unless it is the right shape", () => {
    const repository = read("src/lib/event-hub/repository.ts");

    /* A token that is not 32 hex characters is a probe, not a typo, and
       is turned away without a query. */
    expect(repository).toContain("/^[0-9a-f]{32}$/.test(token)");
  });

  it("is not in the payload a display receives", () => {
    const payload = read("src/lib/event-hub/display-payload.ts");

    /* The interface is the contract; `token` appearing as a field would
       mean a television could hand its own key to anything it talked to. */
    const shape = payload.slice(
      payload.indexOf("export interface DisplayPayload"),
      payload.indexOf("/** The most cards"),
    );

    expect(shape).not.toMatch(/^\s*token:/m);
  });
});
