import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These assert the *shape of the writes*, not just that a function was called.
 *
 * The bug they exist for shipped because every test mocked the repository:
 * `joinEvent` sent `last_seen_at` from the application clock while `joined_at`
 * took the database default, which is evaluated a network hop later. The
 * result was reliably `last_seen_at < joined_at`, the check constraint
 * rejected it, and every join in production failed. Nothing that mocks this
 * layer can see that — only asserting what goes over the wire can.
 */

const insert = vi.fn();
const update = vi.fn();
const eqChain = vi.fn();

function builder() {
  const chain = {
    insert: (payload: unknown) => {
      insert(payload);
      return Promise.resolve({ error: insertError });
    },
    update: (payload: unknown) => {
      update(payload);
      return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
    },
    select: () => chain,
    eq: (...args: unknown[]) => {
      eqChain(...args);
      return chain;
    },
    maybeSingle: () => Promise.resolve({ data: participationRow, error: null }),
  };
  return chain;
}

let insertError: { code?: string } | null = null;
let participationRow: Record<string, string> | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({ from: () => builder() }),
}));

const { joinEvent, findParticipation, touchParticipation } =
  await import("@/lib/events/participants");

beforeEach(() => {
  insert.mockReset();
  update.mockReset();
  eqChain.mockReset();
  insertError = null;
  participationRow = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("joinEvent", () => {
  /*
   * The regression, stated directly: sending a timestamp alongside a column
   * whose default is a *different* clock is what broke every join.
   */
  it("sends no timestamps, so both columns come from the database clock", async () => {
    await joinEvent("event-1", "session-1");

    expect(insert).toHaveBeenCalledWith({
      event_id: "event-1",
      player_session_id: "session-1",
    });

    const payload = insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("last_seen_at");
    expect(payload).not.toHaveProperty("joined_at");
  });

  it("succeeds", async () => {
    expect(await joinEvent("event-1", "session-1")).toBe(true);
  });

  // Re-scanning the printed code is the most likely thing a player does.
  it("treats an existing membership as success rather than an error", async () => {
    insertError = { code: "23505" };

    expect(await joinEvent("event-1", "session-1")).toBe(true);
  });

  it("reports a genuine failure", async () => {
    insertError = { code: "42P01" };

    expect(await joinEvent("event-1", "session-1")).toBe(false);
  });
});

describe("findParticipation", () => {
  it("returns both timestamps, since presence needs last_seen_at", async () => {
    participationRow = {
      joined_at: "2026-08-01T18:00:00.000Z",
      last_seen_at: "2026-08-01T19:00:00.000Z",
    };

    expect(await findParticipation("event-1", "session-1")).toEqual({
      joinedAt: "2026-08-01T18:00:00.000Z",
      lastSeenAt: "2026-08-01T19:00:00.000Z",
    });
  });

  it("returns null when the player is not in the room", async () => {
    participationRow = null;

    expect(await findParticipation("event-1", "session-1")).toBeNull();
  });
});

describe("touchParticipation", () => {
  it("does not write for a player seen moments ago", async () => {
    await touchParticipation("event-1", "session-1", new Date().toISOString());

    expect(update).not.toHaveBeenCalled();
  });

  it("writes once the gap is past the threshold", async () => {
    const old = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    await touchParticipation("event-1", "session-1", old);

    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0]![0]).toHaveProperty("last_seen_at");
  });

  /*
   * The second half of the same bug. The caller used to pass `joined_at`,
   * whose gap only ever grows — so an hour into an event every render wrote.
   */
  it("throttles on elapsed time, so a long session does not write every render", async () => {
    const seenJustNow = new Date().toISOString();

    for (let i = 0; i < 10; i += 1) {
      await touchParticipation("event-1", "session-1", seenJustNow);
    }

    expect(update).not.toHaveBeenCalled();
  });
});
