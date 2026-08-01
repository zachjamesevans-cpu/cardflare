import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Covers the stale-run rule in `activeSyncRun`, which is the only reason a
 * sync can refuse to start. Getting the threshold wrong in one direction lets
 * two syncs run at once; in the other it wedges the admin console permanently
 * on a run that died minutes ago.
 */

let selectResult: { data: unknown; error: unknown } = { data: null, error: null };
const updates: Record<string, unknown>[] = [];

/** Just enough of the PostgREST builder for the two chains under test. */
function fakeAdmin() {
  return {
    from() {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => selectResult,
        update(values: Record<string, unknown>) {
          updates.push(values);
          return { eq: () => ({ eq: async () => ({ error: null }) }) };
        },
      };
      return chain;
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => fakeAdmin(),
  isSupabaseConfigured: () => true,
}));

const { activeSyncRun, STALE_RUN_MS } = await import("@/lib/cards/sync");

const NOW = Date.parse("2026-08-02T12:00:00.000Z");
const startedAgo = (ms: number) => new Date(NOW - ms).toISOString();

beforeEach(() => {
  updates.length = 0;
  selectResult = { data: null, error: null };
});

describe("activeSyncRun", () => {
  it("reports nothing when no run is in progress", async () => {
    await expect(activeSyncRun(NOW)).resolves.toBeNull();
    expect(updates).toEqual([]);
  });

  it("reports a run that is genuinely still going", async () => {
    selectResult = {
      data: { id: "run-1", mode: "full", started_at: startedAgo(60_000) },
      error: null,
    };

    await expect(activeSyncRun(NOW)).resolves.toEqual({
      id: "run-1",
      mode: "full",
      startedAt: startedAgo(60_000),
    });
    expect(updates).toEqual([]);
  });

  /*
   * `finishRun` writes the terminal status, so a killed process — a serverless
   * invocation hitting its limit — leaves the row `running` forever.
   */
  it("marks an abandoned run failed rather than reporting it as live", async () => {
    selectResult = {
      data: { id: "run-1", mode: "full", started_at: startedAgo(STALE_RUN_MS + 1) },
      error: null,
    };

    await expect(activeSyncRun(NOW)).resolves.toBeNull();
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ status: "failed" });
    expect(String(updates[0]!.notes)).toMatch(/abandoned/i);
  });

  it("does not write off a run that is merely slow", async () => {
    selectResult = {
      data: { id: "run-1", mode: "full", started_at: startedAgo(STALE_RUN_MS - 1) },
      error: null,
    };

    expect(await activeSyncRun(NOW)).not.toBeNull();
    expect(updates).toEqual([]);
  });

  /*
   * Fail closed. An unreadable table is not evidence that nothing is running,
   * and treating it as "no run" would let a second sync start on top of one.
   */
  it("throws rather than assuming the coast is clear", async () => {
    selectResult = { data: null, error: { message: "permission denied" } };

    await expect(activeSyncRun(NOW)).rejects.toThrow(/already running/i);
  });
});
