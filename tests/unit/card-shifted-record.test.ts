import { describe, expect, it } from "vitest";

import { OptcgApiProvider } from "@/lib/cards/providers/optcgapi/adapter";

import shifted from "../fixtures/optcgapi/shiftedRecord.json";

/**
 * A real rejected record from the 2 August 2026 full sync, kept verbatim.
 *
 * The provider's row is shifted by one field:
 *
 *   life         "5000"                      — a power
 *   card_power   "Straw Hat Crew Dressrosa"  — traits
 *   sub_types    "Ranged"                    — an attribute
 *   attribute    null
 *
 * Nothing here is a mapping error on our side. A correctly-formed record from
 * the same endpoint has life "5", card_power "5000", sub_types a trait list
 * and attribute an attribute. The data is wrong at source, and the only
 * correct outcome is to skip the record.
 *
 * This file exists so nobody "fixes" the rejection by raising the life
 * ceiling. The message reads `life: Too big: expected number to be <=99`,
 * which invites exactly that — and it would import a Leader with 5000 life,
 * no power, and an attribute sitting in its trait list.
 */
const provider = new OptcgApiProvider();

describe("a record whose fields are shifted at source", () => {
  it("is rejected rather than imported wrong", () => {
    const result = provider.normalizeCard(shifted, "promo");

    expect(result.ok).toBe(false);
  });

  it("is rejected because the life is impossible, and says so", () => {
    const result = provider.normalizeCard(shifted, "promo");
    if (result.ok) throw new Error("expected the record to be rejected");

    expect(result.failure.reason).toMatch(/life/);
  });

  /* Kept whole, which is how the shift was diagnosed in the first place. */
  it("keeps the payload so the shift is visible in the admin console", () => {
    const result = provider.normalizeCard(shifted, "promo");
    if (result.ok) throw new Error("expected the record to be rejected");

    expect(result.failure.raw).toMatchObject({
      life: "5000",
      card_power: "Straw Hat Crew Dressrosa",
    });
  });

  /*
   * The ceiling is not arbitrary. A One Piece Leader has 3-5 life, so 99 is
   * already generous; a value in the thousands can only be a power.
   */
  it("still accepts a plausible life", () => {
    const result = provider.normalizeCard(
      { ...shifted, life: "5", card_power: "5000" },
      "promo",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.life).toBe(5);
    expect(result.card.power).toBe(5000);
  });
});
