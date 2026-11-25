import { describe, expect, it } from "vitest";

import {
  compactCardNumber,
  normalizeName,
  normalizedCardSchema,
  type NormalizedCard,
} from "@/lib/cards/domain";
import { mergeByCardNumber } from "@/lib/cards/sync";

/**
 * The shared card shape every provider's records pass through
 * (`normalizedCardSchema`), and the merge the sync runs over them. Plain
 * objects rather than any one provider's records: what is tested is the
 * shape, not an adapter.
 */
const card = (input: Record<string, unknown>): NormalizedCard =>
  normalizedCardSchema.parse(input);

const luffy = card({
  canonicalCardNumber: "OP01-024",
  exactName: "Monkey D. Luffy",
  cardType: "Character",
  colors: ["red"],
  cost: 5,
  power: 6000,
  counter: 1000,
  rarity: "SR",
  printings: [
    {
      providerExternalId: "OP01-024:normal",
      imageUrl: "https://images.scrydex.com/onepiece/OP01-024/large",
    },
  ],
});

const luffyAlt = card({
  canonicalCardNumber: "OP01-024",
  exactName: "Monkey D. Luffy",
  cardType: "Character",
  power: 7000,
  rarity: "SEC",
  printings: [{ providerExternalId: "OP01-024:altArt" }],
});

const zoro = card({
  canonicalCardNumber: "op01-001",
  exactName: "Roronoa Zoro",
  cardType: "LEADER",
  life: 5,
  printings: [{ providerExternalId: "OP01-001:normal" }],
});

const nami = card({
  canonicalCardNumber: "OP01-016",
  exactName: "Nami",
  printings: [{ providerExternalId: "OP01-016:normal" }],
});

describe("normalizeName", () => {
  it("lowercases, strips punctuation and collapses whitespace", () => {
    expect(normalizeName("Monkey D. Luffy")).toBe("monkey d luffy");
    expect(normalizeName("Trafalgar  Law!")).toBe("trafalgar law");
    expect(normalizeName("  Nami  ")).toBe("nami");
  });

  it("keeps non-Latin scripts rather than reducing them to nothing", () => {
    expect(normalizeName("ゾロ")).toBe("ゾロ");
  });

  it("is idempotent", () => {
    const once = normalizeName("Monkey D. Luffy");
    expect(normalizeName(once)).toBe(once);
  });
});

describe("compactCardNumber", () => {
  it("strips punctuation so a number typed without a dash still matches", () => {
    expect(compactCardNumber("OP01-024")).toBe("OP01024");
    expect(compactCardNumber("op01-024")).toBe("OP01024");
    expect(compactCardNumber("OP01 024")).toBe("OP01024");
  });

  it("returns empty for a number with nothing usable in it", () => {
    expect(compactCardNumber("---")).toBe("");
  });
});

describe("exact name preservation", () => {
  /*
   * The requirement most easily broken by a well-meaning normalisation: the
   * display name must survive byte for byte, punctuation and capitals
   * included, no matter what the searchable form does to it.
   */
  it("never rewrites the provider's display name", () => {
    expect(luffy.exactName).toBe("Monkey D. Luffy");
    expect(luffy.exactName).not.toBe(normalizeName(luffy.exactName));
  });

  it("uppercases the card number but not the name", () => {
    expect(zoro.canonicalCardNumber).toBe("OP01-001");
    expect(zoro.exactName).toBe("Roronoa Zoro");
  });
});

describe("field normalisation", () => {
  it("lowercases the card type so filtering is predictable", () => {
    expect(luffy.cardType).toBe("character");
    expect(zoro.cardType).toBe("leader");
  });

  it("leaves absent optional fields null rather than inventing them", () => {
    expect(zoro.effectText).toBeNull();
    expect(zoro.triggerText).toBeNull();
    expect(zoro.counter).toBeNull();
    expect(zoro.cost).toBeNull();
  });
});

describe("image URLs", () => {
  const imageOf = (imageUrl: unknown) =>
    card({
      canonicalCardNumber: "OP01-024",
      exactName: "Monkey D. Luffy",
      printings: [{ providerExternalId: "OP01-024:normal", imageUrl }],
    }).printings[0]!.imageUrl;

  it("keeps an https URL exactly as supplied", () => {
    expect(imageOf("https://images.scrydex.com/onepiece/OP01-024/large")).toBe(
      "https://images.scrydex.com/onepiece/OP01-024/large",
    );
  });

  /*
   * Dropped, never upgraded to https. Rewriting a provider's URL is guessing
   * at a resource that may not exist there.
   */
  it("drops an insecure image URL rather than rewriting it", () => {
    expect(imageOf("http://images.scrydex.com/onepiece/OP01-024/large")).toBeNull();
  });

  it("leaves a missing image URL null", () => {
    expect(imageOf(undefined)).toBeNull();
  });
});

describe("mergeByCardNumber", () => {
  const merged = mergeByCardNumber([luffy, zoro, nami, luffyAlt]);

  /*
   * Two records share OP01-024. They are one gameplay identity with two
   * printings, not two cards — and the printings must both survive.
   */
  it("collapses records that share a card number", () => {
    expect(merged).toHaveLength(3);

    const merged024 = merged.find((c) => c.canonicalCardNumber === "OP01-024")!;
    expect(merged024.printings).toHaveLength(2);
  });

  it("keeps every distinct printing id", () => {
    const merged024 = merged.find((c) => c.canonicalCardNumber === "OP01-024")!;

    expect(merged024.printings.map((p) => p.providerExternalId).sort()).toEqual([
      "OP01-024:altArt",
      "OP01-024:normal",
    ]);
  });

  // Non-destructive: the first record wins, later ones only fill blanks.
  it("does not overwrite a value the first record already supplied", () => {
    const merged024 = merged.find((c) => c.canonicalCardNumber === "OP01-024")!;

    expect(merged024.rarity).toBe("SR");
    expect(merged024.power).toBe(6000);
  });

  it("is stable when run twice", () => {
    expect(mergeByCardNumber(merged)).toHaveLength(merged.length);
  });
});
