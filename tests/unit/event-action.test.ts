import { beforeEach, describe, expect, it, vi } from "vitest";

const createEvent = vi.fn();
const findEventById = vi.fn();
const setEventStatus = vi.fn();
const getViewer = vi.fn();
const isSupabaseConfigured = vi.fn(() => true);

const STORE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const STORE_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

class RedirectError extends Error {
  constructor(public readonly to: string) {
    super(`redirect:${to}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getViewer: () => getViewer() }));

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => isSupabaseConfigured(),
  getSupabaseAdmin: () => {
    throw new Error("not used in this test");
  },
}));

vi.mock("@/lib/events/repository", () => ({
  createEvent: (...args: unknown[]) => createEvent(...args),
  findEventById: (...args: unknown[]) => findEventById(...args),
  setEventStatus: (...args: unknown[]) => setEventStatus(...args),
}));

const { createEventAction, setEventStatusAction } =
  await import("@/lib/events/actions");
const { CREATE_EVENT_IDLE } = await import("@/lib/events/schema");

function formData(overrides: Record<string, string> = {}) {
  const data = new FormData();
  const fields = {
    storeId: STORE_A,
    name: "Friday Night One Piece",
    startsAt: "2026-08-14T18:00",
    endsAt: "2026-08-14T22:00",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const create = (data: FormData) => createEventAction(CREATE_EVENT_IDLE, data);

async function captureRedirect(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof RedirectError) return error.to;
    throw error;
  }
  throw new Error("expected a redirect");
}

const storeViewer = (storeIds: string[]) => ({
  kind: "store" as const,
  user: { id: "user-store" },
  storeIds,
});

beforeEach(() => {
  createEvent.mockReset().mockResolvedValue({ id: "event-1", store_id: STORE_A });
  findEventById.mockReset().mockResolvedValue({ id: "event-1", store_id: STORE_A });
  setEventStatus.mockReset().mockResolvedValue(undefined);
  getViewer.mockReset().mockResolvedValue(storeViewer([STORE_A]));
  isSupabaseConfigured.mockReset().mockReturnValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createEventAction", () => {
  it("creates an event for a store the viewer belongs to", async () => {
    const to = await captureRedirect(() => create(formData()));

    expect(to).toBe("/store/events/event-1");
    expect(createEvent).toHaveBeenCalledOnce();
  });

  /*
   * The store id arrives in a hidden field, so it is attacker-controlled. It
   * is checked against the membership the server resolved, never trusted.
   */
  it("refuses to create an event for another store", async () => {
    getViewer.mockResolvedValue(storeViewer([STORE_A]));

    const result = await create(formData({ storeId: STORE_B }));

    expect(result.status).toBe("error");
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("refuses when the viewer belongs to no store at all", async () => {
    getViewer.mockResolvedValue({ kind: "unaffiliated", user: { id: "u" } });

    const result = await create(formData());

    expect(result.status).toBe("error");
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("lets an admin create an event for any store", async () => {
    getViewer.mockResolvedValue({ kind: "admin", user: { id: "admin-1" } });

    await captureRedirect(() => create(formData({ storeId: STORE_B })));

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: STORE_B }),
      "admin-1",
    );
  });

  it("sends an anonymous visitor to sign in", async () => {
    getViewer.mockResolvedValue({ kind: "anonymous" });

    const to = await captureRedirect(() => create(formData()));

    expect(to).toBe("/login?next=/store");
    expect(createEvent).not.toHaveBeenCalled();
  });

  /*
   * "That store does not exist" and "that store is not yours" must read the
   * same, or the form becomes a way to discover which store ids are real.
   */
  it("says the same thing for someone else's store as for a missing one", async () => {
    const other = await create(formData({ storeId: STORE_B }));
    const missing = await create(
      formData({ storeId: "cccccccc-cccc-cccc-cccc-cccccccccccc" }),
    );

    expect(other.status === "error" && other.message).toBe(
      missing.status === "error" && missing.message,
    );
  });

  it("reports field errors without touching the database", async () => {
    const result = await create(formData({ name: "" }));

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: { name: expect.any(String) },
    });
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("keeps what was typed when validation fails", async () => {
    const result = await create(formData({ name: "", startsAt: "2026-08-14T18:00" }));

    expect(result.status === "error" && result.values.startsAt).toBe(
      "2026-08-14T18:00",
    );
  });

  it("reports a generic error when the insert fails", async () => {
    createEvent.mockRejectedValue(new Error("duplicate key value violates"));

    const result = await create(formData());

    expect(result.status).toBe("error");
    expect(result.status === "error" && result.message).not.toMatch(/duplicate key/i);
  });
});

describe("setEventStatusAction", () => {
  function statusForm(status: string, eventId = "event-1") {
    const data = new FormData();
    data.set("eventId", eventId);
    data.set("status", status);
    return data;
  }

  it("changes the status of the viewer's own event", async () => {
    await setEventStatusAction(statusForm("open"));

    expect(setEventStatus).toHaveBeenCalledWith("event-1", "open");
  });

  /*
   * The store is read from the event row, not the request. Otherwise a member
   * of any store could close another store's event by posting its id.
   */
  it("refuses to change an event belonging to another store", async () => {
    findEventById.mockResolvedValue({ id: "event-9", store_id: STORE_B });

    await setEventStatusAction(statusForm("closed", "event-9"));

    expect(setEventStatus).not.toHaveBeenCalled();
  });

  it("rejects a status that is not one of the three", async () => {
    for (const status of ["deleted", "OPEN", "", "draft; drop table events"]) {
      await setEventStatusAction(statusForm(status));
    }

    expect(setEventStatus).not.toHaveBeenCalled();
    expect(findEventById).not.toHaveBeenCalled();
  });

  it("does nothing when the event does not exist", async () => {
    findEventById.mockResolvedValue(null);

    await setEventStatusAction(statusForm("open", "missing"));

    expect(setEventStatus).not.toHaveBeenCalled();
  });

  it("lets an admin change any store's event", async () => {
    getViewer.mockResolvedValue({ kind: "admin", user: { id: "admin-1" } });
    findEventById.mockResolvedValue({ id: "event-9", store_id: STORE_B });

    await setEventStatusAction(statusForm("closed", "event-9"));

    expect(setEventStatus).toHaveBeenCalledWith("event-9", "closed");
  });
});
