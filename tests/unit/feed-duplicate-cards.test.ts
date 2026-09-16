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
    expect(repo).toContain(": cards.filter(({ match }) => match).length");
    expect(repo).not.toContain("total: group.length");
  });
});

describe("your own Flares reach your own feed", () => {
  /*
   * The founder: "whenever i post a flare, it should also show in my
   * feed, like how instagram does that for ur own posts."
   *
   * The Feed knew about them and would not show them. Hunt rows are
   * built from the follow list, and nobody follows themselves, so the
   * one thing you are certain to care about was the one thing filtered
   * out.
   */
  it("carries the viewer as an author, without making them someone they follow", async () => {
    const repo = await readFile("src/lib/feed/repository.ts", "utf8");

    /* A second map. `followed` also decides who can appear in "just
       added to their binder" and who is worth suggesting, and neither
       should start talking about you. */
    expect(repo).toContain("const authors = new Map(followed);");
    expect(repo).toContain("authors.set(playerId, me)");
    expect(repo).toContain("async function viewerAsAuthor");
  });

  it("says it is yours, rather than filing it under people you follow", async () => {
    const repo = await readFile("src/lib/feed/repository.ts", "utf8");

    expect(repo).toContain('yours: key.split("::")[0] === viewerId');
    expect(repo).toContain('return item.yours ? "yours" : "people"');
    expect(repo).toContain(
      'return item.yours ? "Your Flare" : "Because you follow them"',
    );
    expect(repo).toContain('yours: "Your flares"');
  });

  it("keeps your posts together at the top", async () => {
    /*
     * Both clients draw a heading only when the section CHANGES, so an
     * own post between two followed ones would read "Your flares /
     * People you follow / Your flares".
     */
    const repo = await readFile("src/lib/feed/repository.ts", "utf8");

    const own = repo.indexOf('item.kind === "hunt" && item.yours');
    const others = repo.indexOf('item.kind === "hunt" && !item.yours');
    expect(own).toBeGreaterThan(-1);
    expect(others).toBeGreaterThan(own);
  });
});

describe("a Flare posted with no board still reaches your feed", () => {
  /*
   * The founder posted one and watched nothing happen: "when i post a
   * flare. it should also show in my feed. like how instagram does."
   *
   * The follow list was not the problem this time. A Flare from the
   * Flare tab is an AREA Flare, written with `event_id: null` and
   * `player_id` set directly - while every builder in the feed reads
   * flares through an event and a player_session. So those posts
   * reached NO feed at all, anyone's, and the composer's own promise
   * ("No room needed. Your friends see it in the Feed") was untrue.
   */
  it("reads the boardless ones, by player rather than by session", async () => {
    const repo = await readFile("src/lib/feed/repository.ts", "utf8");

    expect(repo).toContain("async function areaHuntsFor");
    expect(repo).toContain('.is("event_id", null)');
    /*
     * EVERY author, not just the viewer. Reading only your own is what
     * made following somebody nearly pointless: their Flares reached you
     * only if they had posted onto a board at a shop you had also saved.
     */
    expect(repo).toContain('.in("player_id", [...authors.keys()])');
    expect(repo).toContain("yours: authorId === viewerId");
    /* Grouped by posting act, so a pasted deck is one post with one
       thread rather than thirty rows. */
    expect(repo).toContain("flare.posted_batch ?? flare.id");
  });

  it("lets a hunt have no room, rather than inventing one", async () => {
    const repo = await readFile("src/lib/feed/repository.ts", "utf8");

    const hunt = repo.slice(
      repo.indexOf("export interface HuntItem"),
      repo.indexOf("export interface TradedItem"),
    );
    expect(hunt).toContain("code: string | null;");
    expect(hunt).toContain("storeName: string | null;");
    expect(hunt).toContain("eventName: string | null;");
  });

  it("draws neither a room's name nor a button to it, on both platforms", async () => {
    /*
     * Both clients interpolated `eventName` straight into the detail
     * line and linked to `/e/${code}`, so a boardless Flare would have
     * printed the word "null" and offered a door to nowhere. A type
     * error would not have caught it - both were template strings.
     */
    /* The post is its own component on both platforms now. Its status
       line never names the event, and the door to a room is guarded. */
    const items = await readFile("src/components/feed/flare-feed-card.tsx", "utf8");
    const app = await readFile("mobile/src/flare-feed-card.tsx", "utf8");

    for (const source of [items, app]) {
      expect(source).not.toMatch(/\$\{item\.eventName\}/);
      expect(source).toMatch(/item\.code && item\.storeName \?/);
    }
  });
});

describe("a Flare posted at a store is drawn as a post", () => {
  /*
   * The founder, with the two tabs side by side: "look at the my flares
   * section. the goal is to have that design be the main feed, but also
   * so I can revert back to what it ats now if i dont like it."
   *
   * My Flares looked better because it was a different KIND. Your own
   * Flares are hunts, drawn by FlareFeedCard - a post with a card, its
   * chips, a heart and a thread. A Flare somebody posted at a shop was a
   * "recent", drawn by an older row with a cramped rail, a button and no
   * way to answer it. Same event, two shapes, purely by accident of the
   * order they were written in.
   */
  it("turns store Flares into the same post shape as every other Flare", async () => {
    const repo = await readFile("src/lib/feed/repository.ts", "utf8");

    expect(repo).toContain("function asPost(item: RecentItem): FeedItem");
    expect(repo).toContain("...recent.map(asPost)");
    /* Inherits the post design, the heart and the thread by BEING a
       hunt, rather than by having all of that written twice. */
    expect(repo).toMatch(/return \{\s*kind: "hunt",\s*postId: item\.postId,/);
  });

  it("can be turned off again without touching anything else", async () => {
    /* "so I can revert back to what it ats now if i dont like it." The
       old row is still built, still typed and still drawn by both
       clients; the flag decides which one leaves the server. */
    const repo = await readFile("src/lib/feed/repository.ts", "utf8");

    expect(repo).toContain("const FLARES_AS_POSTS = true;");
    expect(repo).toContain("if (!FLARES_AS_POSTS || !item.playerId || !item.postId)");
    /* The old kind is still a kind, so flipping the flag is the whole
       revert. */
    expect(repo).toContain('kind: "recent";');
  });

  it("leaves a guest's Flare as the old row", async () => {
    /* A post hangs off a person. Somebody who scanned a counter code and
       typed a name has no profile to open, and is answerable in the room
       they posted in. */
    const repo = await readFile("src/lib/feed/repository.ts", "utf8");
    expect(repo).toContain("!item.playerId");
  });

  it("says which way the card points, now that both directions arrive", async () => {
    /* A hunt was always a want, so the line was a constant. A showcase
       post reading "is hunting" would be backwards. */
    for (const path of [
      "src/components/feed/flare-feed-card.tsx",
      "mobile/src/flare-feed-card.tsx",
    ]) {
      const source = await readFile(path, "utf8");
      expect(source).toContain("function statusLabel(");
      /* "is offering" since the post grew its card-count chip; the older
         "is letting go of" is still the app's wording until it catches up. */
      expect(source).toMatch(/is offering|is letting go of/);
    }
  });
});
