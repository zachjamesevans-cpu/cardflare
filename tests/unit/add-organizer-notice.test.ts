import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Adding an organizer says why it did not happen. "Already an organizer
 * here", a failed write and the rate limit all used to vanish, and the
 * Add button simply did nothing.
 */

const addOrganizer = vi.fn();
let viewer: Record<string, unknown> = {};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("@/lib/auth/session", () => ({ getViewer: async () => viewer }));
vi.mock("@/lib/stores/staff", () => ({
  addOrganizer: (...a: unknown[]) => addOrganizer(...a),
  removeOrganizer: vi.fn(),
}));

const { addOrganizerAction } = await import("@/lib/stores/staff-actions");
const { resetRateLimits } = await import("@/lib/rate-limit");

function form(): FormData {
  const data = new FormData();
  data.set("storeId", "store-1");
  data.set("playerId", "player-1");
  return data;
}

beforeEach(() => {
  resetRateLimits();
  viewer = {
    kind: "store",
    user: { id: "owner-1" },
    storeRoles: { "store-1": "owner" },
  };
  addOrganizer.mockReset().mockResolvedValue({ ok: true });
});

describe("addOrganizerAction", () => {
  it("adds, and says it is done", async () => {
    await expect(addOrganizerAction({ status: "idle" }, form())).resolves.toEqual({
      status: "done",
    });
  });

  it("passes on why the store refused", async () => {
    addOrganizer.mockResolvedValue({
      ok: false,
      message: "That player is already an organizer here.",
    });

    await expect(addOrganizerAction({ status: "idle" }, form())).resolves.toEqual({
      status: "error",
      message: "That player is already an organizer here.",
    });
  });

  it("tells an organizer that only the owner adds people", async () => {
    viewer = {
      kind: "store",
      user: { id: "staff-1" },
      storeRoles: { "store-1": "staff" },
    };
    const notice = await addOrganizerAction({ status: "idle" }, form());

    expect(notice.status === "error" && notice.message).toMatch(/owner/);
    expect(addOrganizer).not.toHaveBeenCalled();
  });
});
