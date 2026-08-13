import { describe, expect, it } from "vitest";

import {
  GRANT_MAX,
  grantEmbersSchema,
  unlockCosmeticsSchema,
} from "@/lib/admin/grant-schema";

const PLAYER = "11111111-1111-4111-8111-111111111111";

/**
 * What the console may hand out.
 *
 * The rule that matters most is not in here — a grant crediting the
 * spendable balance and never the public badge is enforced by
 * `grant_embers` in SQL and probed against PostgreSQL 16. What this file
 * covers is the shape of the request that reaches it.
 */
describe("grantEmbersSchema", () => {
  it("takes an amount typed into a form", () => {
    const parsed = grantEmbersSchema.safeParse({
      playerId: PLAYER,
      amount: "250",
      note: "Thanks for testing",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.amount).toBe(250);
      expect(parsed.data.note).toBe("Thanks for testing");
    }
  });

  it("refuses nothing, or less than nothing", () => {
    for (const amount of ["0", "-5"]) {
      expect(grantEmbersSchema.safeParse({ playerId: PLAYER, amount }).success).toBe(
        false,
      );
    }
  });

  it("refuses a fraction of an Ember", () => {
    expect(
      grantEmbersSchema.safeParse({ playerId: PLAYER, amount: "1.5" }).success,
    ).toBe(false);
  });

  /*
   * The cap is a guard against a slipped digit, not a policy about
   * generosity — an admin who means to give more can click twice.
   */
  it("caps a single grant, exactly at the cap", () => {
    expect(
      grantEmbersSchema.safeParse({ playerId: PLAYER, amount: String(GRANT_MAX) })
        .success,
    ).toBe(true);
    expect(
      grantEmbersSchema.safeParse({ playerId: PLAYER, amount: String(GRANT_MAX + 1) })
        .success,
    ).toBe(false);
  });

  it("refuses a player id that is not one", () => {
    expect(
      grantEmbersSchema.safeParse({ playerId: "not-a-uuid", amount: "10" }).success,
    ).toBe(false);
  });

  it("treats a missing note as no note rather than failing", () => {
    const parsed = grantEmbersSchema.safeParse({ playerId: PLAYER, amount: "10" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.note).toBe("");
  });
});

describe("unlockCosmeticsSchema", () => {
  /* A form sends strings; the column is a boolean. */
  it("reads the toggle both ways", () => {
    const on = unlockCosmeticsSchema.safeParse({ playerId: PLAYER, unlocked: "true" });
    const off = unlockCosmeticsSchema.safeParse({
      playerId: PLAYER,
      unlocked: "false",
    });

    expect(on.success && on.data.unlocked).toBe(true);
    expect(off.success && off.data.unlocked).toBe(false);
  });

  it("refuses anything that is not one of those two", () => {
    expect(
      unlockCosmeticsSchema.safeParse({ playerId: PLAYER, unlocked: "yes" }).success,
    ).toBe(false);
  });
});
