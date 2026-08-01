import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { compactCardNumber, normalizeName } from "@/lib/cards/domain";
import { OptcgApiProvider } from "@/lib/cards/providers/optcgapi/adapter";
import { mergeByCardNumber } from "@/lib/cards/sync";

/**
 * The fixture is synthetic and says so. It cannot confirm optcgapi's real
 * field names — `npm run cards:probe` does that, and `MAPPING_STATUS` gates
 * the sync until someone has. What it does confirm is how the adapter behaves
 * given the shapes any provider might send: numbers as strings, "-" for
 * inapplicable, absent optional fields, an insecure image URL, a record with
 * no card number at all.
 */
const fixture = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../fixtures/optcgapi/synthetic-cards.json"),
    "utf8",
  ),
) as unknown[];

const provider = new OptcgApiProvider();
const normalize = (input: unknown, source?: "set" | "starter-deck" | "promo" | "don") =>
  provider.normalizeCard(input, source);

function cardAt(index: number) {
  const result = normalize(fixture[index]);
  if (!result.ok) throw new Error(`fixture ${index} failed: ${result.failure.reason}`);
  return result.card;
}

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
    expect(cardAt(0).exactName).toBe("Monkey D. Luffy");
    expect(cardAt(0).exactName).not.toBe(normalizeName(cardAt(0).exactName));
  });

  it("uppercases the card number but not the name", () => {
    const zoro = cardAt(1);

    expect(zoro.canonicalCardNumber).toBe("OP01-001");
    expect(zoro.exactName).toBe("Roronoa Zoro");
  });
});

describe("field normalisation", () => {
  it("reads numbers that arrive as strings", () => {
    const luffy = cardAt(0);

    expect(luffy.cost).toBe(5);
    expect(luffy.power).toBe(6000);
    expect(luffy.counter).toBe(1000);
  });

  it('treats "-" as not applicable rather than a number', () => {
    // A Leader has no cost. "-" must become null, never 0 or NaN.
    expect(cardAt(1).cost).toBeNull();
    expect(cardAt(1).life).toBe(5);
  });

  it("splits a delimited colour list", () => {
    expect(cardAt(0).colors).toEqual(["red"]);
    expect(cardAt(1).colors).toEqual(["red", "green"]);
  });

  it("splits traits on the provider's delimiter", () => {
    expect(cardAt(0).traits).toEqual(["Supernovas", "Straw Hat Crew"]);
  });

  it("lowercases the card type so filtering is predictable", () => {
    expect(cardAt(0).cardType).toBe("character");
    expect(cardAt(1).cardType).toBe("leader");
  });

  it("leaves absent optional fields null rather than inventing them", () => {
    const zoro = cardAt(1);

    expect(zoro.effectText).toBeNull();
    expect(zoro.triggerText).toBeNull();
    expect(zoro.counter).toBeNull();
  });

  it("keeps the raw record for debugging", () => {
    expect(cardAt(0).rawMetadata).toMatchObject({ card_set_id: "OP01-024" });
  });
});

describe("image URLs", () => {
  it("keeps an https URL exactly as supplied", () => {
    expect(cardAt(0).printings[0]!.imageUrl).toBe(
      "https://optcgapi.com/images/cards/OP01-024.png",
    );
  });

  /*
   * Dropped, never upgraded to https. Rewriting a provider's URL is guessing
   * at a resource that may not exist there.
   */
  it("drops an insecure image URL rather than rewriting it", () => {
    expect(cardAt(2).printings[0]!.imageUrl).toBeNull();
  });

  it("leaves a missing image URL null", () => {
    expect(cardAt(1).printings[0]!.imageUrl).toBeNull();
  });
});

describe("variant classification", () => {
  /*
   * The brief forbids guessing. A rarity of SEC on a second record with the
   * same card number is suggestive of an alternate art, and suggestive is not
   * good enough — a wrong guess splits one card in two or merges two into one.
   */
  it("never infers a variant classification", () => {
    for (const index of [0, 3]) {
      const printing = cardAt(index).printings[0]!;

      expect(printing.variantType).toBeNull();
      expect(printing.isAlternateArt).toBeNull();
      expect(printing.isPromo).toBeNull();
      expect(printing.isParallel).toBeNull();
      expect(printing.isReprint).toBeNull();
    }
  });
});

describe("failures", () => {
  it("rejects a record with no card number, and says which record", () => {
    const result = normalize(fixture[4]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.providerExternalId).toBe("optcg-5-broken");
    expect(result.failure.raw).toBe(fixture[4]);
  });

  it("rejects a record that is not an object", () => {
    for (const input of [null, "a card", 42, ["nested"]]) {
      expect(normalize(input).ok).toBe(false);
    }
  });

  // One bad record must not abandon the rest of a bulk response.
  it("returns failures rather than throwing", () => {
    expect(() => normalize(fixture[4])).not.toThrow();
  });
});

describe("mergeByCardNumber", () => {
  const merged = mergeByCardNumber(
    fixture.slice(0, 4).flatMap((raw) => {
      const result = normalize(raw);
      return result.ok ? [result.card] : [];
    }),
  );

  /*
   * Two provider records share OP01-024. They are one gameplay identity with
   * two printings, not two cards — and the printings must both survive.
   */
  it("collapses records that share a card number", () => {
    expect(merged).toHaveLength(3);

    const luffy = merged.find((c) => c.canonicalCardNumber === "OP01-024")!;
    expect(luffy.printings).toHaveLength(2);
  });

  it("keeps every distinct printing id", () => {
    const luffy = merged.find((c) => c.canonicalCardNumber === "OP01-024")!;

    expect(luffy.printings.map((p) => p.providerExternalId).sort()).toEqual([
      "set:OP01-024:optcg-1",
      "set:OP01-024:optcg-4-altart",
    ]);
  });

  // Non-destructive: the first record wins, later ones only fill blanks.
  it("does not overwrite a value the first record already supplied", () => {
    const luffy = merged.find((c) => c.canonicalCardNumber === "OP01-024")!;

    expect(luffy.rarity).toBe("SR");
    expect(luffy.power).toBe(6000);
  });

  it("is stable when run twice", () => {
    expect(mergeByCardNumber(merged)).toHaveLength(merged.length);
  });
});

describe("printing keys", () => {
  /*
   * The whole reason the key is composite. Two records share OP01-024 and
   * differ only in artwork; keying on the card number would have merged them
   * into one printing and lost an alternate art, which the brief forbids
   * outright.
   */
  it("gives two artworks of one card number two different keys", () => {
    const base = cardAt(0).printings[0]!.providerExternalId;
    const alt = cardAt(3).printings[0]!.providerExternalId;

    expect(base).not.toBe(alt);
  });

  it("includes the source, so a booster and a starter deck do not collide", () => {
    const record = { card_set_id: "ST01-001", card_name: "Roronoa Zoro" };

    const fromSet = normalize(record, "set");
    const fromDeck = normalize(record, "starter-deck");

    expect(fromSet.ok && fromDeck.ok).toBe(true);
    if (!fromSet.ok || !fromDeck.ok) return;

    expect(fromSet.card.printings[0]!.providerExternalId).toContain("set:");
    expect(fromDeck.card.printings[0]!.providerExternalId).toContain("starter-deck:");
    expect(fromSet.card.printings[0]!.providerExternalId).not.toBe(
      fromDeck.card.printings[0]!.providerExternalId,
    );
  });

  /*
   * Stability is the point: an unstable key would create a fresh printing row
   * on every sync instead of updating the existing one.
   */
  it("is stable across repeated normalisation of the same record", () => {
    const once = normalize(fixture[0]);
    const twice = normalize(fixture[0]);

    expect(once.ok && twice.ok).toBe(true);
    if (!once.ok || !twice.ok) return;

    expect(once.card.printings[0]!.providerExternalId).toBe(
      twice.card.printings[0]!.providerExternalId,
    );
  });

  /*
   * Regression: `card_set_id` is a candidate for both the card number and the
   * external id, so the "discriminator" was sometimes just the card number
   * again — and two printings collapsed to one key.
   */
  it("falls back to a fingerprint when the only id is the card number", () => {
    const withoutIds = {
      card_set_id: "OP99-001",
      card_name: "No Identifiers",
      rarity: "C",
    };

    const first = normalize(withoutIds);
    const second = normalize({ ...withoutIds, rarity: "SR" });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    // Different printings of the same number still separate.
    expect(first.card.printings[0]!.providerExternalId).not.toBe(
      second.card.printings[0]!.providerExternalId,
    );
  });

  it("records the provider image id when one is supplied", () => {
    const withImage = normalize({
      card_set_id: "OP01-024",
      card_name: "Monkey D. Luffy",
      card_image_id: "img-991",
      card_image: "https://optcgapi.com/images/OP01-024_alt.png",
    });

    expect(withImage.ok).toBe(true);
    if (!withImage.ok) return;

    expect(withImage.card.printings[0]!.imageId).toBe("img-991");
    expect(withImage.card.printings[0]!.providerExternalId).toContain("img-991");
  });
});
