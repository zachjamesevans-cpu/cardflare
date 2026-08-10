import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The record editor's guards.
 *
 * These actions rewrite other people's names and credentials, so they
 * are the last place that should trust a caller: admin is re-checked
 * from scratch on every one, and a user id posted in a form has to be
 * proven to belong to the store or player being edited. Both rules are
 * pinned here, plus the honest reporting of a taken address.
 */

const getViewer = vi.fn();
const updateStoreRecord = vi.fn();
const updatePlayerName = vi.fn();
const updateSignInEmail = vi.fn();
const isStoreMember = vi.fn();
const userIdForPlayer = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getViewer: () => getViewer() }));
vi.mock("@/lib/admin/records", () => ({
  updateStoreRecord: (...a: unknown[]) => updateStoreRecord(...a),
  updatePlayerName: (...a: unknown[]) => updatePlayerName(...a),
  updateSignInEmail: (...a: unknown[]) => updateSignInEmail(...a),
  isStoreMember: (...a: unknown[]) => isStoreMember(...a),
  userIdForPlayer: (...a: unknown[]) => userIdForPlayer(...a),
}));

const { updateStoreAction, updatePlayerAction, updateSignInEmailAction } =
  await import("@/lib/admin/record-actions");

const { RECORD_EDIT_IDLE } = await import("@/lib/admin/record-schema");

const STORE = "11111111-1111-4111-8111-111111111111";
const PLAYER = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const storeFields = {
  storeId: STORE,
  name: "Mox Valley Games",
  contactEmail: "Hello@MoxValley.com",
  city: "Renton",
  region: "WA",
};

beforeEach(() => {
  for (const fn of [
    getViewer,
    updateStoreRecord,
    updatePlayerName,
    updateSignInEmail,
    isStoreMember,
    userIdForPlayer,
  ]) {
    fn.mockReset();
  }

  getViewer.mockResolvedValue({ kind: "admin", user: { id: "admin-1" } });
  updateStoreRecord.mockResolvedValue({ ok: true });
  updatePlayerName.mockResolvedValue({ ok: true });
  updateSignInEmail.mockResolvedValue({ ok: true });
  isStoreMember.mockResolvedValue(true);
  userIdForPlayer.mockResolvedValue(USER);
});

describe("updateStoreAction", () => {
  it("renames the store in place, lowercasing the contact address", async () => {
    const state = await updateStoreAction(RECORD_EDIT_IDLE, form(storeFields));

    expect(state.status).toBe("saved");
    expect(updateStoreRecord).toHaveBeenCalledWith(
      STORE,
      expect.objectContaining({
        name: "Mox Valley Games",
        contactEmail: "hello@moxvalley.com",
        city: "Renton",
        region: "WA",
      }),
    );
  });

  it("empties an optional field to null rather than an empty string", async () => {
    await updateStoreAction(RECORD_EDIT_IDLE, form({ ...storeFields, city: "" }));

    expect(updateStoreRecord).toHaveBeenCalledWith(
      STORE,
      expect.objectContaining({ city: null }),
    );
  });

  it.each([
    ["a store member", { kind: "store", user: { id: "u" }, storeIds: [STORE] }],
    ["a player", { kind: "player", playerId: PLAYER }],
    ["a guest", { kind: "anonymous" }],
  ])("writes nothing for %s", async (_label, viewer) => {
    getViewer.mockResolvedValue(viewer);

    const state = await updateStoreAction(RECORD_EDIT_IDLE, form(storeFields));

    expect(state.status).toBe("error");
    expect(updateStoreRecord).not.toHaveBeenCalled();
  });

  it("refuses a malformed address without touching the record", async () => {
    const state = await updateStoreAction(
      RECORD_EDIT_IDLE,
      form({ ...storeFields, contactEmail: "not-an-address" }),
    );

    expect(state.status).toBe("error");
    expect(updateStoreRecord).not.toHaveBeenCalled();
  });
});

describe("updatePlayerAction", () => {
  it("renames a player", async () => {
    const state = await updatePlayerAction(
      RECORD_EDIT_IDLE,
      form({ playerId: PLAYER, displayName: "  Kaito  " }),
    );

    expect(state.status).toBe("saved");
    expect(updatePlayerName).toHaveBeenCalledWith(PLAYER, "Kaito");
  });

  it("writes nothing for a non-admin", async () => {
    getViewer.mockResolvedValue({ kind: "anonymous" });

    await updatePlayerAction(
      RECORD_EDIT_IDLE,
      form({ playerId: PLAYER, displayName: "Kaito" }),
    );

    expect(updatePlayerName).not.toHaveBeenCalled();
  });
});

describe("updateSignInEmailAction", () => {
  it("changes the address for a verified store member", async () => {
    const state = await updateSignInEmailAction(
      RECORD_EDIT_IDLE,
      form({ userId: USER, email: "new@moxvalley.com", storeId: STORE }),
    );

    expect(state.status).toBe("saved");
    expect(isStoreMember).toHaveBeenCalledWith(STORE, USER);
    expect(updateSignInEmail).toHaveBeenCalledWith(USER, "new@moxvalley.com");
  });

  it("changes the address for the player's own auth user", async () => {
    const state = await updateSignInEmailAction(
      RECORD_EDIT_IDLE,
      form({ userId: USER, email: "kaito@example.com", playerId: PLAYER }),
    );

    expect(state.status).toBe("saved");
    expect(updateSignInEmail).toHaveBeenCalledWith(USER, "kaito@example.com");
  });

  /*
   * The id comes from a form, so on its own it proves nothing. Without
   * this check the console would be a way to point any account at any
   * address.
   */
  it("refuses a user id that does not belong to the store", async () => {
    isStoreMember.mockResolvedValue(false);

    const state = await updateSignInEmailAction(
      RECORD_EDIT_IDLE,
      form({ userId: USER, email: "attacker@example.com", storeId: STORE }),
    );

    expect(state.status).toBe("error");
    expect(updateSignInEmail).not.toHaveBeenCalled();
  });

  it("refuses a user id that is not the player's own", async () => {
    userIdForPlayer.mockResolvedValue("44444444-4444-4444-8444-444444444444");

    await updateSignInEmailAction(
      RECORD_EDIT_IDLE,
      form({ userId: USER, email: "attacker@example.com", playerId: PLAYER }),
    );

    expect(updateSignInEmail).not.toHaveBeenCalled();
  });

  it("refuses when neither a store nor a player scopes the change", async () => {
    await updateSignInEmailAction(
      RECORD_EDIT_IDLE,
      form({ userId: USER, email: "loose@example.com" }),
    );

    expect(updateSignInEmail).not.toHaveBeenCalled();
  });

  it("says so when another account already uses the address", async () => {
    updateSignInEmail.mockResolvedValue({ ok: false, reason: "email-taken" });

    const state = await updateSignInEmailAction(
      RECORD_EDIT_IDLE,
      form({ userId: USER, email: "taken@example.com", storeId: STORE }),
    );

    expect(state).toEqual({
      status: "error",
      message: "Another account already uses that address.",
    });
  });

  it("writes nothing for a non-admin", async () => {
    getViewer.mockResolvedValue({
      kind: "store",
      user: { id: "u" },
      storeIds: [STORE],
    });

    await updateSignInEmailAction(
      RECORD_EDIT_IDLE,
      form({ userId: USER, email: "new@moxvalley.com", storeId: STORE }),
    );

    expect(updateSignInEmail).not.toHaveBeenCalled();
  });
});
