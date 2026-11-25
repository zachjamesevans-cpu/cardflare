import { describe, expect, it } from "vitest";

import { normalizationFailure, normalizedCardSchema } from "@/lib/cards/domain";

/**
 * A source once sent a Leader shifted by one field: its power in `life`
 * ("5000"), its traits in the power column. The data was wrong at source,
 * and the only correct outcome was to skip the record.
 *
 * This file exists so nobody "fixes" such a rejection by raising the life
 * ceiling. The message reads `life: Too big: expected number to be <=99`,
 * which invites exactly that — and it would import a Leader with 5000 life.
 */
const leader = {
  canonicalCardNumber: "P-001",
  exactName: "Monkey.D.Luffy",
  cardType: "Leader",
};

describe("a record whose life is impossible", () => {
  it("is rejected because the life is impossible, and says so", () => {
    const parsed = normalizedCardSchema.safeParse({ ...leader, life: 5000 });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const result = normalizationFailure(
      { ...leader, life: 5000 },
      "P-001",
      parsed.error,
    );
    if (result.ok) throw new Error("expected the record to be rejected");
    expect(result.failure.reason).toMatch(/life/);
  });

  /*
   * The ceiling is not arbitrary. A One Piece Leader has 3-5 life, so 99 is
   * already generous; a value in the thousands can only be a power.
   */
  it("still accepts a plausible life", () => {
    const parsed = normalizedCardSchema.safeParse({ ...leader, life: 5, power: 5000 });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.life).toBe(5);
    expect(parsed.data.power).toBe(5000);
  });
});
