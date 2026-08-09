import { describe, expect, it } from "vitest";

import { addEntrySchema, deckLabelSchema, partitionByDeck } from "@/lib/lists/schema";

/**
 * Deck folders: a label typed per card is the whole mechanism, so the
 * cleaning and the grouping are the two things that can silently rot.
 */

describe("deckLabelSchema", () => {
  it("collapses whitespace and trims, like a note", () => {
    expect(deckLabelSchema.parse("  RG   Luffy ")).toBe("RG Luffy");
  });

  it("turns emptiness into null", () => {
    expect(deckLabelSchema.parse("")).toBeNull();
    expect(deckLabelSchema.parse("   ")).toBeNull();
  });

  it("refuses a label past forty characters", () => {
    expect(deckLabelSchema.safeParse("x".repeat(41)).success).toBe(false);
    expect(deckLabelSchema.safeParse("x".repeat(40)).success).toBe(true);
  });

  it("refuses the characters display names refuse", () => {
    expect(deckLabelSchema.safeParse("RG‮Luffy").success).toBe(false);
  });
});

describe("addEntrySchema with a deck", () => {
  const base = { cardId: "11111111-1111-4111-8111-111111111111", quantity: 1 };

  it("defaults the label to null when omitted", () => {
    const parsed = addEntrySchema.parse(base);
    expect(parsed.deckLabel).toBeNull();
  });

  it("carries a cleaned label through", () => {
    const parsed = addEntrySchema.parse({ ...base, deckLabel: " RG Luffy " });
    expect(parsed.deckLabel).toBe("RG Luffy");
  });
});

describe("partitionByDeck", () => {
  const entry = (id: string, deckLabel: string | null) => ({ id, deckLabel });

  it("splits folders from loose cards, keeping board order", () => {
    const { folders, loose } = partitionByDeck([
      entry("a", "RG Luffy"),
      entry("b", null),
      entry("c", "RG Luffy"),
      entry("d", "Blue Doffy"),
      entry("e", null),
    ]);

    expect(folders.map((folder) => folder.label)).toEqual(["RG Luffy", "Blue Doffy"]);
    expect(folders[0]?.entries.map((e) => e.id)).toEqual(["a", "c"]);
    expect(loose.map((e) => e.id)).toEqual(["b", "e"]);
  });

  it("merges labels case-insensitively under the first spelling seen", () => {
    const { folders } = partitionByDeck([
      entry("a", "RG Luffy"),
      entry("b", "rg luffy"),
      entry("c", "RG LUFFY"),
    ]);

    expect(folders).toHaveLength(1);
    expect(folders[0]?.label).toBe("RG Luffy");
    expect(folders[0]?.entries).toHaveLength(3);
  });

  it("treats a whitespace-only label as loose", () => {
    const { folders, loose } = partitionByDeck([entry("a", "  ")]);
    expect(folders).toHaveLength(0);
    expect(loose).toHaveLength(1);
  });

  it("an all-loose board has no folders at all", () => {
    const { folders, loose } = partitionByDeck([entry("a", null), entry("b", null)]);
    expect(folders).toHaveLength(0);
    expect(loose.map((e) => e.id)).toEqual(["a", "b"]);
  });
});
