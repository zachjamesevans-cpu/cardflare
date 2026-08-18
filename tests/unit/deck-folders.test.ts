import { describe, expect, it } from "vitest";

import {
  addEntrySchema,
  deckLabelSchema,
  partitionByDeck,
  UNNAMED_BATCH,
} from "@/lib/lists/schema";

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

/**
 * A batch with no name is still one act.
 *
 * The founder's report: "the grouped flares are not functioning
 * properly." `posted_batch` was added so a deck put up in one action
 * could be told apart from thirty separate decisions, and the
 * notifications and the Feed both used it — but the ROOM board grouped
 * on `deck_label` alone. So anybody who pasted a list without naming it
 * got thirty loose rows, which is the pile the grouping exists to
 * prevent.
 */
describe("grouping a batch nobody named", () => {
  const card = (
    id: string,
    deckLabel: string | null,
    postedBatch: string | null = null,
  ) => ({ id, deckLabel, postedBatch });

  it("collapses an unlabelled batch into one folder", () => {
    const { folders, loose } = partitionByDeck([
      card("a", null, "batch-1"),
      card("b", null, "batch-1"),
      card("c", null, "batch-1"),
    ]);

    expect(folders).toHaveLength(1);
    expect(folders[0].label).toBe(UNNAMED_BATCH);
    expect(folders[0].entries).toHaveLength(3);
    expect(loose).toEqual([]);
  });

  it("keeps two different sittings apart", () => {
    const { folders } = partitionByDeck([
      card("a", null, "batch-1"),
      card("b", null, "batch-1"),
      card("c", null, "batch-2"),
      card("d", null, "batch-2"),
    ]);

    expect(folders).toHaveLength(2);
    expect(folders.map((folder) => folder.entries.length)).toEqual([2, 2]);
  });

  it("prefers the name the player chose over the batch", () => {
    /* Two sittings of the same named deck belong together — the label is
       a decision, the batch is only a fact about when. */
    const { folders } = partitionByDeck([
      card("a", "RG Luffy", "batch-1"),
      card("b", "rg luffy", "batch-2"),
    ]);

    expect(folders).toHaveLength(1);
    expect(folders[0].label).toBe("RG Luffy");
    expect(folders[0].entries).toHaveLength(2);
  });

  it("leaves a card posted on its own as a loose row", () => {
    const { folders, loose } = partitionByDeck([card("a", null, null)]);

    expect(folders).toEqual([]);
    expect(loose).toHaveLength(1);
  });

  it("does not make a folder out of a batch of one", () => {
    /* A pile of one is a card. A folder containing a single thing is
       furniture around nothing. */
    const { folders, loose } = partitionByDeck([
      card("a", null, "batch-1"),
      card("b", null, "batch-2"),
      card("c", null, "batch-2"),
    ]);

    expect(folders).toHaveLength(1);
    expect(folders[0].entries).toHaveLength(2);
    expect(loose.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("never loses a card, whatever the mix", () => {
    /* The invariant that matters most on a board somebody is standing in
       front of: everything posted appears exactly once. */
    const entries = [
      card("a", "RG Luffy", "b1"),
      card("b", null, "b1"),
      card("c", null, null),
      card("d", null, "b2"),
      card("e", null, "b2"),
      card("f", "Blue Doffy", null),
    ];

    const { folders, loose } = partitionByDeck(entries);
    const seen = [...folders.flatMap((folder) => folder.entries), ...loose];

    expect(seen).toHaveLength(entries.length);
    expect(new Set(seen.map((entry) => entry.id)).size).toBe(entries.length);
  });
});
