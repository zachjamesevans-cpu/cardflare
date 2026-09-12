import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { firstPerCard } from "@/lib/feed/repository";

/**
 * The same card, twice in one row.
 *
 * The founder, off the iOS simulator: "there's a glitch error code."
 * It was React's "Encountered two children with the same key", and the
 * picture underneath it was Steven B's row drawing Megalo twice.
 *
 * The cause was not the key. Every card row mapped FLARES to tiles, and
 * a Flare carries a quantity but does not stop the same card arriving
 * twice - two printings of it, or two lines of a pasted deck list. A
 * FeedCard is identified by the CARD, so a repeat gave React the same
 * key twice and gave the reader the same picture twice. The second is
 * the worse bug: it is wrong on the screen whatever the keys are.
 */
describe("a card appears once in a row", () => {
  const cards = (ids: string[]) => ids.map((cardId, at) => ({ cardId, at }));

  it("keeps one of a repeat", () => {
    const kept = firstPerCard(cards(["a", "b", "a", "c", "b"]), (e) => e.cardId);

    expect(kept.map((e) => e.cardId)).toEqual(["a", "b", "c"]);
  });

  it("keeps the FIRST one, because callers sort what matters to the front", () => {
    /* The hunt row sorts the cards the viewer can answer to the front,
       so the copy that survives has to be that one. */
    const entries = [
      { cardId: "megalo", match: "exact" },
      { cardId: "megalo", match: null },
    ];

    expect(firstPerCard(entries, (e) => e.cardId)).toEqual([
      { cardId: "megalo", match: "exact" },
    ]);
  });

  it("leaves a row with no repeats exactly as it was", () => {
    const entries = cards(["a", "b", "c"]);

    expect(firstPerCard(entries, (e) => e.cardId)).toEqual(entries);
  });

  it("holds the order the caller chose", () => {
    /* Not sorted, not grouped - a row reads in the order the builder
       decided, and dedupe must not quietly reorder it. */
    const kept = firstPerCard(cards(["c", "a", "c", "b"]), (e) => e.cardId);

    expect(kept.map((e) => e.cardId)).toEqual(["c", "a", "b"]);
  });

  it("says nothing about an empty row", () => {
    expect(firstPerCard([], (e: { cardId: string }) => e.cardId)).toEqual([]);
  });
});

describe("every row that draws cards goes through it", () => {
  /*
   * Read off the source, because the builders need a database and this
   * is a rule about all of them rather than about any one query. Three
   * rows draw card art from Flares - hunt, recent and a board's sample -
   * and all three had the fault. `added` never did: it has always built
   * from a set of card ids, which is where the rule came from.
   */
  it("hunt and board dedupe, and recent tracks what it has drawn", async () => {
    const repo = await readFile("src/lib/feed/repository.ts", "utf8");

    /* Both of the ones that can sort first do it through the helper. */
    expect(repo).toContain("firstPerCard(ordered, (entry) => entry.flare.cardId)");
    expect(repo).toContain("firstPerCard(answerable, (entry) => entry.flare.cardId)");

    /*
     * `recent` collects incrementally, so it cannot hand a finished list
     * to the helper. It carries the set instead - and the set has to be
     * consulted BEFORE the cap, or a duplicate past twenty would become
     * "+1 more" rather than nothing at all.
     */
    expect(repo).toContain("const seen = new Map<string, Set<string>>()");
    expect(repo).toContain("if (drawn?.has(flare.card_id)) continue;");
  });

  it("counts what it draws, so a row's numbers match its pictures", async () => {
    /*
     * The hunt row says "you can answer 3 of 8" and trails a "+N more"
     * derived from `total`. Once the tiles are one per card, both counts
     * have to be of cards too - otherwise a row with a repeat in it
     * claims a card it will not show.
     */
    const repo = await readFile("src/lib/feed/repository.ts", "utf8");

    expect(repo).toContain("total: cards.length");
    expect(repo).toContain("youCanAnswer: cards.filter(({ match }) => match).length");
    expect(repo).not.toContain("total: group.length");
  });
});
