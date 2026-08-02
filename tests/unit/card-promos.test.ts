import { describe, expect, it } from "vitest";

import {
  OptcgApiProvider,
  OPTCGAPI_ENDPOINTS,
} from "@/lib/cards/providers/optcgapi/adapter";
import { printingLabel } from "@/lib/cards/schema";

import promos from "../fixtures/optcgapi/allPromos.json";

/**
 * Against real records from the provider's own documentation for
 * `/api/allPromos/`, supplied 2 August 2026.
 *
 * The promo endpoint was previously wrong — `/api/allPromoCards/`, inferred
 * from the naming of its neighbours — and 404d, so every promo was missing
 * from the catalog while the sync still reported success.
 */

const provider = new OptcgApiProvider();
const normalize = (record: unknown) => provider.normalizeCard(record, "promo");

describe("the promo endpoint", () => {
  it("is the path the provider documents, not the one we guessed", () => {
    expect(OPTCGAPI_ENDPOINTS.promoCards).toBe("/api/allPromos/");
  });
});

describe("a promo record", () => {
  it("normalises without loss", () => {
    const result = normalize(promos[0]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.card.canonicalCardNumber).toBe("OP09-077");
    expect(result.card.exactName).toBe(
      "Gum-Gum Lightning (Premium Card Collection -Best Selection Vol. 4-)",
    );
    expect(result.card.cardType).toBe("event");
    expect(result.card.rarity).toBe("UC");
    expect(result.card.cost).toBe(2);
  });

  /*
   * Not inference: the record came from the promos endpoint, so the provider
   * has classified it. The other three flags stay null because it has not.
   */
  it("is recorded as a promo, and claims nothing else", () => {
    const result = normalize(promos[0]);
    if (!result.ok) throw new Error("expected the record to normalise");

    const printing = result.card.printings[0]!;

    expect(printing.isPromo).toBe(true);
    expect(printing.isAlternateArt).toBeNull();
    expect(printing.isParallel).toBeNull();
    expect(printing.isReprint).toBeNull();
    expect(printing.source).toBe("promo");
  });

  /*
   * A set card is not thereby known *not* to be a promo — only unclassified.
   * Writing false there would turn an absence of information into a fact.
   */
  it("leaves the flag unknown for records from other endpoints", () => {
    const result = provider.normalizeCard(promos[0], "set");
    if (!result.ok) throw new Error("expected the record to normalise");

    expect(result.card.printings[0]!.isPromo).toBeNull();
  });

  /*
   * The promo carries the same card number and the same set id as the booster
   * printing. Keying on either would merge two products into one.
   */
  it("keys separately from the booster printing of the same number", () => {
    const asPromo = normalize(promos[0]);
    const asSet = provider.normalizeCard(promos[0], "set");
    if (!asPromo.ok || !asSet.ok) throw new Error("expected both to normalise");

    expect(asPromo.card.printings[0]!.providerExternalId).not.toBe(
      asSet.card.printings[0]!.providerExternalId,
    );
  });

  /* The observed records carry no artwork at all. Null, never invented. */
  it("stores no image URL when the provider supplied none", () => {
    for (const record of promos) {
      const result = normalize(record);
      if (!result.ok) throw new Error("expected the record to normalise");

      expect(result.card.printings[0]!.imageUrl).toBeNull();
      expect(result.card.printings[0]!.imageId).toBeNull();
    }
  });
});

describe("how a promo reads to a player", () => {
  const base = {
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
