import { describe, expect, it } from "vitest";

import { parseProvidedCards, providedCardSchema } from "@/lib/cards/provider";

function card(overrides: Record<string, unknown> = {}) {
  return {
    code: "OP01-024",
    name: "Monkey D. Luffy",
    category: "character",
    ...overrides,
  };
}

describe("providedCardSchema", () => {
  it("accepts a minimal card and fills the optional fields", () => {
    const result = providedCardSchema.safeParse(card());

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      colors: [],
      types: [],
      cost: null,
      power: null,
      aliases: [],
      printings: [],
    });
  });

  /* The column requires uppercase, so normalising here is what stops a
   * provider's lowercase export failing every row at the database. */
  it("uppercases the card code", () => {
    expect(providedCardSchema.parse(card({ code: "op01-024" })).code).toBe("OP01-024");
    expect(providedCardSchema.parse(card({ code: " op01-024 " })).code).toBe(
      "OP01-024",
    );
  });

  it("lowercases aliases and drops duplicates", () => {
    const parsed = providedCardSchema.parse(
      card({ aliases: ["Red Luffy", "red luffy", "RED LUFFY", "Luffy"] }),
    );

    expect(parsed.aliases).toEqual(["red luffy", "luffy"]);
  });

  it("rejects a category the database does not have", () => {
    expect(providedCardSchema.safeParse(card({ category: "vehicle" })).success).toBe(
      false,
    );
  });

  it("rejects stats outside the column bounds", () => {
    expect(providedCardSchema.safeParse(card({ cost: 500 })).success).toBe(false);
    expect(providedCardSchema.safeParse(card({ life: -1 })).success).toBe(false);
    expect(providedCardSchema.safeParse(card({ cost: 1.5 })).success).toBe(false);
  });

  /* Artwork is gated at import, but an http URL should never get that far —
   * the column has the same check. */
  it("rejects a non-https image URL on a printing", () => {
    const withImage = (imageUrl: string) =>
      providedCardSchema.safeParse(card({ printings: [{ setCode: "OP01", imageUrl }] }))
        .success;

    expect(withImage("https://example.test/a.png")).toBe(true);
    expect(withImage("http://example.test/a.png")).toBe(false);
  });

  it("normalises a printing's set code", () => {
    const parsed = providedCardSchema.parse(card({ printings: [{ setCode: "op01" }] }));

    expect(parsed.printings[0]).toMatchObject({ setCode: "OP01", variant: null });
  });
});

describe("parseProvidedCards", () => {
  it("returns the parsed cards when every record is valid", () => {
    const result = parseProvidedCards([card(), card({ code: "OP01-025" })]);

    expect(result.ok).toBe(true);
    expect(result.ok && result.cards).toHaveLength(2);
  });

  it("rejects anything that is not an array", () => {
    for (const raw of [null, {}, "cards", 42]) {
      expect(parseProvidedCards(raw).ok).toBe(false);
    }
  });

  /*
   * An import of a few thousand cards with one bad row should say which row,
   * not stop at the first. Reporting only the first turns a data fix into a
   * loop of re-running the import.
   */
  it("reports every bad record, not just the first", () => {
    const result = parseProvidedCards([
      card({ code: "OP01-001", category: "vehicle" }),
      card({ code: "OP01-002" }),
      card({ code: "OP01-003", cost: 999 }),
    ]);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join("\n")).toContain("OP01-001");
    expect(result.ok === false && result.errors.join("\n")).toContain("OP01-003");
  });

  it("identifies a bad record by index when it has no usable code", () => {
    const result = parseProvidedCards([{ name: "No code" }]);

    expect(result.ok === false && result.errors[0]).toContain("index 0");
  });

  /*
   * Wrong card data is worse than missing card data when someone is hunting a
   * trade, so a failed record is never partially salvaged.
   */
  it("fails the whole import rather than importing a subset", () => {
    const result = parseProvidedCards([card(), card({ category: "vehicle" })]);

    expect(result.ok).toBe(false);
  });
});
