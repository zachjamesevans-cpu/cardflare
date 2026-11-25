import { describe, expect, it } from "vitest";

import { printingLabel } from "@/lib/cards/schema";

describe("how a promo reads to a player", () => {
  const base = {
    id: "11111111-1111-1111-1111-111111111111",
    setCode: "OP09",
    setName: "One Piece Promotion Cards",
    printingLabel: "OP09",
    variantType: null,
    rarity: null,
    printingName: null,
    imageUrl: null,
  };

  /*
   * Two people at a table need to know which copy is which. Without this both
   * printings of OP09-077 render as "OP09".
   */
  it("says so, rather than reading identically to the booster printing", () => {
    expect(printingLabel({ ...base, isPromo: true })).toBe("OP09 · Promo");
    expect(printingLabel({ ...base, isPromo: null })).toBe("OP09");
    expect(printingLabel({ ...base, isPromo: false })).toBe("OP09");
  });
});
