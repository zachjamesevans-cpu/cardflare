import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The show actions' guards. Two audiences, two threat models: the vendor
 * actions must not let anyone act as a store they do not belong to (or as a
 * store that is not a vendor at all), and the attendee search must stay
 * public without becoming a way to probe anything but a show code.
 */

const getViewer = vi.fn();
const claimBooth = vi.fn();
const leaveShow = vi.fn();
const upsertInventory = vi.fn();
const removeInventory = vi.fn();
const findShowById = vi.fn();
const showAvailability = vi.fn();
const findShowByJoinCode = vi.fn();
const searchCards = vi.fn();
const storeKind = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => "203.0.113.7" }),
}));

vi.mock("@/lib/auth/session", () => ({ getViewer: () => getViewer() }));

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => storeKind() }) }),
    }),
  }),
}));

vi.mock("@/lib/shows/repository", () => ({
  claimBooth: (...a: unknown[]) => claimBooth(...a),
  leaveShow: (...a: unknown[]) => leaveShow(...a),
  upsertInventory: (...a: unknown[]) => upsertInventory(...a),
  removeInventory: (...a: unknown[]) => removeInventory(...a),
  findShowById: (...a: unknown[]) => findShowById(...a),
  showAvailability: (...a: unknown[]) => showAvailability(...a),
  createShow: vi.fn(),
}));

vi.mock("@/lib/events/repository", () => ({
  findShowByJoinCode: (...a: unknown[]) => findShowByJoinCode(...a),
}));

vi.mock("@/lib/cards/search", () => ({
  searchCards: (...a: unknown[]) => searchCards(...a),
}));

const { claimBoothAction, addInventoryAction, searchShowCardsAction } =
  await import("@/lib/shows/actions");
const { INVENTORY_IDLE } = await import("@/lib/shows/schema");
const { resetRateLimits } = await import("@/lib/rate-limit");

const STORE = "00000000-0000-0000-0000-00000000000b";
const CARD = "00000000-0000-0000-0000-0000000000c1";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  for (const fn of [
    getViewer,
    claimBooth,
    leaveShow,
    upsertInventory,
    removeInventory,
    findShowById,
    showAvailability,
    findShowByJoinCode,
    searchCards,
    storeKind,
  ]) {
    fn.mockReset();
  }

  resetRateLimits();
  getViewer.mockResolvedValue({
    kind: "store",
    user: { id: "u1" },
    storeIds: [STORE],
  });
  storeKind.mockResolvedValue({ data: { kind: "vendor" }, error: null });
  findShowById.mockResolvedValue({
    id: "show-1",
    ends_at: new Date(Date.now() + 86_400_000).toISOString(),
  });
  claimBooth.mockResolvedValue(true);
  upsertInventory.mockResolvedValue({ ok: true });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("claimBoothAction", () => {
  const fields = { storeId: STORE, showId: "show-1", booth: "A12" };

  it("claims for a vendor the viewer belongs to", async () => {
    await claimBoothAction(form(fields));

    expect(claimBooth).toHaveBeenCalledWith("show-1", STORE, "A12");
  });

  it("claims nothing for a store the viewer does not belong to", async () => {
    getViewer.mockResolvedValue({ kind: "store", user: { id: "u1" }, storeIds: [] });

    await claimBoothAction(form(fields));

    expect(claimBooth).not.toHaveBeenCalled();
  });

  /*
   * An LGS is a member of its own store, but its store is not a vendor —
   * booths and inventory belong to the other kind of operator.
   */
  it("claims nothing for a store that is not a vendor", async () => {
    storeKind.mockResolvedValue({ data: { kind: "lgs" }, error: null });

    await claimBoothAction(form(fields));

    expect(claimBooth).not.toHaveBeenCalled();
  });

  it("claims nothing at a show that has ended", async () => {
    findShowById.mockResolvedValue({
      id: "show-1",
      ends_at: new Date(Date.now() - 1000).toISOString(),
    });

    await claimBoothAction(form(fields));

    expect(claimBooth).not.toHaveBeenCalled();
  });

  it("refuses a malformed booth before touching anything", async () => {
    await claimBoothAction(form({ ...fields, booth: "definitely not a booth" }));

    expect(claimBooth).not.toHaveBeenCalled();
    expect(storeKind).not.toHaveBeenCalled();
  });
});

describe("addInventoryAction", () => {
  const fields = {
    storeId: STORE,
    cardId: CARD,
    form: "slab",
    grader: "PSA",
    grade: "10",
    quantity: "2",
  };

  it("saves a parsed line for an authorised vendor", async () => {
    const state = await addInventoryAction(INVENTORY_IDLE, form(fields));

    expect(state.status).toBe("added");
    expect(upsertInventory).toHaveBeenCalledWith(
      STORE,
      expect.objectContaining({ form: "slab", grader: "PSA", grade: 10, quantity: 2 }),
    );
  });

  it("surfaces the slab rule instead of a generic error", async () => {
    const state = await addInventoryAction(
      INVENTORY_IDLE,
      form({ ...fields, grader: "" }),
    );

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/grading company/i);
    expect(upsertInventory).not.toHaveBeenCalled();
  });

  it("writes nothing for a non-member", async () => {
    getViewer.mockResolvedValue({ kind: "store", user: { id: "u1" }, storeIds: [] });

    const state = await addInventoryAction(INVENTORY_IDLE, form(fields));

    expect(state.status).toBe("error");
    expect(upsertInventory).not.toHaveBeenCalled();
  });
});

describe("searchShowCardsAction", () => {
  beforeEach(() => {
    findShowByJoinCode.mockResolvedValue({ id: "show-1", name: "Dallas" });
    searchCards.mockResolvedValue([{ id: CARD, exactName: "Perona" }]);
    showAvailability.mockResolvedValue(
      new Map([[CARD, [{ storeId: STORE, vendorName: "SlabCity", booth: "B7" }]]]),
    );
  });

  it("returns results with availability keyed by card", async () => {
    const response = await searchShowCardsAction("AAAAAAAA", "perona");

    expect(response.status).toBe("ok");
    if (response.status === "ok") {
      expect(response.availability[CARD]?.[0]).toMatchObject({ booth: "B7" });
    }
    expect(showAvailability).toHaveBeenCalledWith("show-1", [CARD]);
  });

  it("normalises the code a person typed", async () => {
    await searchShowCardsAction("aaaa-aaaa", "perona");

    expect(findShowByJoinCode).toHaveBeenCalledWith("AAAAAAAA");
  });

  /*
   * Codes of the other lengths are events and counter codes. Searching a
   * show is not a way to probe them — the action refuses before any lookup.
   */
  it.each([
    ["an event code", "K3M9PZ"],
    ["a counter code", "K3M9PZQ"],
    // "not a code" is a trap: it normalises to N0TAC0DE, a well-formed
    // show code. Real junk has to leave the alphabet.
    ["junk", "not!a!code"],
  ])("refuses %s without touching the database", async (_label, code) => {
    const response = await searchShowCardsAction(code, "perona");

    expect(response.status).toBe("error");
    expect(findShowByJoinCode).not.toHaveBeenCalled();
    expect(searchCards).not.toHaveBeenCalled();
  });

  it("says so when the show does not exist", async () => {
    findShowByJoinCode.mockResolvedValue(null);

    const response = await searchShowCardsAction("AAAAAAAA", "perona");

    expect(response.status).toBe("error");
    expect(searchCards).not.toHaveBeenCalled();
  });
});
