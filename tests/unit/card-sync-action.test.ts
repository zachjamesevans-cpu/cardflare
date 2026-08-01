import { beforeEach, describe, expect, it, vi } from "vitest";

const getViewer = vi.fn();
const syncCards = vi.fn();
const activeSyncRun = vi.fn();

const ADMIN = {
  kind: "admin" as const,
  user: { id: "11111111-1111-1111-1111-111111111111" },
};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getViewer: () => getViewer() }));

vi.mock("@/lib/cards/sync", () => ({
  syncCards: (...args: unknown[]) => syncCards(...args),
  activeSyncRun: (...args: unknown[]) => activeSyncRun(...args),
}));

const { syncCatalogAction } = await import("@/lib/cards/sync-actions");
const { SYNC_IDLE } = await import("@/lib/cards/sync-state");
const { resetRateLimits } = await import("@/lib/rate-limit");

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const run = (fields: Record<string, string>) =>
  syncCatalogAction(SYNC_IDLE, formData(fields));

const SUMMARY = {
  runId: "run-1",
  provider: "optcgapi",
  mode: "sample" as const,
  recordsSeen: 5,
  cardsUpserted: 3,
  printingsUpserted: 4,
  recordsFailed: 1,
  imagesSkipped: 0,
  uniqueCards: 3,
};

beforeEach(() => {
  resetRateLimits();
  getViewer.mockReset().mockResolvedValue(ADMIN);
  activeSyncRun.mockReset().mockResolvedValue(null);
  syncCards.mockReset().mockResolvedValue(SUMMARY);
});

describe("syncCatalogAction", () => {
  /*
   * The gate that matters. Rendering the form behind `requireAdmin` protects
   * the button; the action is a public POST endpoint and has to protect itself.
   */
  it("refuses everyone who is not an admin, without contacting the provider", async () => {
    for (const viewer of [
      { kind: "anonymous" },
      { kind: "unaffiliated", user: { id: "u" } },
      { kind: "store", user: { id: "u" }, storeIds: ["s"] },
    ]) {
      getViewer.mockResolvedValue(viewer);

      const state = await run({ mode: "sample" });

      expect(state.status).toBe("error");
    }

    expect(syncCards).not.toHaveBeenCalled();
  });

  it("tells an unauthorised caller nothing specific", async () => {
    getViewer.mockResolvedValue({ kind: "anonymous" });

    const state = await run({ mode: "sample" });

    expect(state.status === "error" && state.message).not.toMatch(/admin|sign in/i);
  });

  it("runs a sample sync and reports the counts", async () => {
    const state = await run({ mode: "sample" });

    expect(syncCards).toHaveBeenCalledTimes(1);
    expect(syncCards.mock.calls[0]![1]).toEqual({ mode: "sample" });
    expect(state).toMatchObject({
      status: "success",
      mode: "sample",
      runId: "run-1",
      counts: { recordsSeen: 5, uniqueCards: 3, recordsFailed: 1 },
    });
  });

  it("refuses a mode it does not recognise", async () => {
    const state = await run({ mode: "everything" });

    expect(state.status).toBe("error");
    expect(syncCards).not.toHaveBeenCalled();
  });

  /*
   * The checkbox is a speed bump in the browser. A POST that simply omits it
   * must not get a full catalog pull.
   */
  it("will not run a full sync without the confirmation", async () => {
    const state = await run({ mode: "full" });

    expect(state.status).toBe("error");
    expect(syncCards).not.toHaveBeenCalled();
  });

  it("runs a full sync once confirmed", async () => {
    await run({ mode: "full", confirm: "on" });

    expect(syncCards.mock.calls[0]![1]).toEqual({ mode: "full" });
  });

  /*
   * Two concurrent syncs would double the load on a free provider and race
   * each other's upserts.
   */
  it("refuses while another run is in progress", async () => {
    activeSyncRun.mockResolvedValue({
      id: "run-0",
      mode: "full",
      startedAt: "2026-08-02T10:00:00.000Z",
    });

    const state = await run({ mode: "sample" });

    expect(state.status).toBe("error");
    expect(state.status === "error" && state.message).toContain("still running");
    expect(syncCards).not.toHaveBeenCalled();
  });

  it("does not start a run when it cannot tell whether one is active", async () => {
    activeSyncRun.mockRejectedValue(new Error("database unreachable"));

    const state = await run({ mode: "sample" });

    expect(state.status).toBe("error");
    expect(syncCards).not.toHaveBeenCalled();
  });

  /*
   * A partially-written catalog is a different situation from a rejected
   * request, so the two are different states rather than one error string.
   */
  it("distinguishes a run that failed part-way from a refusal", async () => {
    syncCards.mockRejectedValue(new Error("Could not upsert cards: timeout"));

    const state = await run({ mode: "sample" });

    expect(state.status).toBe("failed");
  });

  it("never leaks the underlying error to the browser", async () => {
    syncCards.mockRejectedValue(
      new Error("connect ECONNREFUSED 10.0.0.4:5432 as user postgres"),
    );

    const state = await run({ mode: "sample" });

    const message = state.status === "failed" ? state.message : "";
    expect(message).not.toMatch(/ECONNREFUSED|postgres|10\.0\.0\.4/);
  });

  it("stops an admin hammering the provider", async () => {
    for (let i = 0; i < 4; i += 1) {
      expect((await run({ mode: "sample" })).status).toBe("success");
    }

    const state = await run({ mode: "sample" });

    expect(state.status).toBe("error");
    expect(state.status === "error" && state.message).toMatch(/too many/i);
    expect(syncCards).toHaveBeenCalledTimes(4);
  });
});
