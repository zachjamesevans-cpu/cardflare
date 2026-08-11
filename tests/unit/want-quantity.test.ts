import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The clamp on a saved want's quantity.
 *
 * Two buttons drive this, so the interesting cases are the ends: minus
 * at one, plus at ninety-nine, and whatever a hand-written request feels
 * like sending. None of them is an error — the control has no room to
 * report one, and "minus at one" honestly means one. What must never
 * happen is a zero or a negative reaching the database, because a want
 * disappears only through Remove.
 */

const update = vi.fn();
const eqPlayer = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: () => ({
      update: (values: unknown) => {
        update(values);
        return { eq: () => ({ eq: (...a: unknown[]) => eqPlayer(...a) }) };
      },
    }),
  }),
}));

const { setWantQuantity } = await import("@/lib/players/wants");

beforeEach(() => {
  update.mockReset();
  eqPlayer.mockReset();
  eqPlayer.mockResolvedValue({ error: null });
});

describe("setWantQuantity", () => {
  it("writes an ordinary number through unchanged", async () => {
    await expect(setWantQuantity("w1", "player-1", 3)).resolves.toBe(3);

    expect(update).toHaveBeenCalledWith({ quantity: 3 });
    expect(eqPlayer).toHaveBeenCalledWith("player_id", "player-1");
  });

  it("holds the floor at one rather than deleting or going negative", async () => {
    for (const asked of [0, -1, -99]) {
      await expect(setWantQuantity("w1", "player-1", asked)).resolves.toBe(1);
    }

    expect(update).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenLastCalledWith({ quantity: 1 });
  });

  it("holds the ceiling at ninety-nine", async () => {
    await expect(setWantQuantity("w1", "player-1", 400)).resolves.toBe(99);

    expect(update).toHaveBeenCalledWith({ quantity: 99 });
  });

  it("rounds a fractional quantity rather than storing it", async () => {
    await expect(setWantQuantity("w1", "player-1", 2.6)).resolves.toBe(3);

    expect(update).toHaveBeenCalledWith({ quantity: 3 });
  });

  /* The player's id is part of the write, not a check before it: a want
     belonging to someone else matches no row and changes nothing. */
  it("scopes every write to the player who owns the list", async () => {
    await setWantQuantity("someone-elses", "player-1", 2);

    expect(eqPlayer).toHaveBeenCalledWith("player_id", "player-1");
  });
});
