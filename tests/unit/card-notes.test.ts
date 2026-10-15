import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  CARD_NOTE_MAX,
  CARD_NOTE_SUGGESTIONS,
  tidyCardNote,
} from "@/lib/flares/card-note";

/**
 * A note on each card of a Flare. The founder (2026-10-12): "let's say
 * there's 10 people looking for a card you have ... how do you choose
 * who to message? it should have their note under it ... the note would
 * be perfect to be placed under the full card view. so it's not taking
 * up feed space and only visible if someone clicks the card."
 */

const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("the note itself", () => {
  it("is one short line, and empty is no note", () => {
    expect(tidyCardNote("  For   my\nPC  ")).toBe("For my PC");
    expect(tidyCardNote("   ")).toBeNull();
    expect(tidyCardNote(null)).toBeNull();
    expect(tidyCardNote("x".repeat(200))).toHaveLength(CARD_NOTE_MAX);
    expect(CARD_NOTE_MAX).toBe(80);
  });

  it("offers the common reasons as one tap", () => {
    expect(CARD_NOTE_SUGGESTIONS).toEqual([
      "For my PC",
      "Building a deck",
      "Trading up",
      "Need it this week",
    ]);
  });

  it("is the same module, word for word, in the app", () => {
    expect(read("mobile/src/card-note.ts")).toBe(read("src/lib/flares/card-note.ts"));
  });

  it("has its own column, not the caption's", () => {
    const sql = read("supabase/migrations/20261120090000_flare_card_notes.sql");
    expect(sql).toMatch(/add column if not exists card_note text/);
    expect(sql).toMatch(/char_length\(card_note\) <= 80/);
  });
});

describe("posting a note", () => {
  it("writes each card's note on both paths, and onto the saved want", () => {
    const publish = read("src/lib/flares/publish.ts");
    expect(publish).toContain("card_note: cardNote");
    expect(publish).toContain("cardNote: tidyCardNote(item.cardNote)");
    expect(read("src/lib/local/area.ts")).toContain(
      "...(input.cardNote ? { card_note: input.cardNote } : {})",
    );
    expect(read("src/app/api/v1/flares/publish/route.ts")).toContain(
      "cardNote: tidyCardNote(item.cardNote)",
    );
  });

  /* Posting used to upsert every want with note: null. */
  it("never wipes a saved want's note when a Flare has none", () => {
    const wants = read("src/lib/players/wants.ts");
    expect(wants).toContain(
      "...(entry.note !== undefined ? { note: entry.note } : {})",
    );
    expect(read("src/lib/flares/publish.ts")).not.toMatch(
      /saveWant\(input\.playerId, \{[^}]*note: null/,
    );
  });

  it("is written in the composer on both platforms", () => {
    expect(read("src/components/flares/flare-composer.tsx")).toContain(
      "<CardNoteField",
    );
    expect(read("src/components/flares/flare-composer.tsx")).toContain(
      "cardNote: item.cardNote?.trim() || null",
    );
    expect(read("mobile/src/screens/flare-composer.tsx")).toContain("<CardNoteField");
    expect(read("mobile/src/screens/flare-composer.tsx")).toContain(
      "cardNote: item.cardNote?.trim() || null",
    );
  });
});

describe("reading a note", () => {
  it("rides every Feed card and the post's own page", () => {
    const feed = read("src/lib/feed/repository.ts");
    expect(feed.match(/note, card_note,/g)?.length).toBeGreaterThanOrEqual(4);
    expect(read("src/lib/lists/repository.ts")).toContain("note, card_note,");
    expect(read("src/lib/feed/posts.ts")).toContain("cardNote: flare.cardNote");
  });

  it("is under the card when it is opened, never on the Feed itself", () => {
    expect(read("mobile/src/flare-deck-pager.tsx")).toContain(
      "note: card.cardNote ?? null",
    );
    expect(read("src/components/feed/flare-feed-card.tsx")).toContain(
      "note: card.cardNote ?? null",
    );
    /* No mark on the Feed's tiles: the founder, "delete that note icon
       from the feed ... it mainly applies to nearby feature." The note
       is read when the card is opened, and on Wanted near you. */
    for (const file of [
      "mobile/src/flare-deck-pager.tsx",
      "mobile/src/flare-feed-card-compact.tsx",
      "mobile/src/card-rail.tsx",
      "src/components/feed/feed-tile.tsx",
      "src/components/feed/flare-feed-card.tsx",
      "src/components/feed/flare-feed-card-compact.tsx",
    ]) {
      expect(read(file), file).not.toMatch(/NoteMark|hasNote/);
    }
  });

  it("is under each person on Wanted near you, from a Flare or a saved want", () => {
    const matching = read("src/lib/nearby/matching.ts");
    expect(matching).toContain("note: row.card_note ?? null");
    expect(matching).toContain("note: row.note ?? null");
    expect(read("mobile/src/wanted-near-you.tsx")).toContain("person.note ?");
    expect(read("src/components/nearby/wanted-list.tsx")).toContain("person.note &&");
  });
});

describe("changing a note later", () => {
  it("is the owner's only, and the saved want follows", () => {
    const server = read("src/lib/flares/card-note-server.ts");
    expect(server).toContain(
      'if (owner !== playerId) return { ok: false, reason: "not-yours" }',
    );
    expect(server).toContain('.from("player_wants")');
    expect(read("src/app/api/v1/posts/[postId]/route.ts")).toContain(
      'action: z.literal("set-card-note")',
    );
  });

  it("is offered under your own card only, on both platforms", () => {
    expect(read("mobile/src/flare-deck-pager.tsx")).toMatch(
      /post\?\.yours && card\.flareId/,
    );
    expect(read("src/components/feed/flare-feed-card.tsx")).toMatch(
      /item\.yours && card\.flareId \? \{ flareId: card\.flareId \}/,
    );
    expect(read("mobile/src/ui.tsx")).toContain("<ZoomNoteEditor");
    expect(read("src/components/cards/card-image-zoom.tsx")).toContain(
      "<ZoomNoteEditor",
    );
  });
});
