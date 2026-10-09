import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { heldFirst } from "@/lib/matching/held-first";

/*
 * The founder (2026-10-09): "The only person who sees the match is the
 * person who has the card anyways, so I think it should show a green
 * highlight around it - and those cards should show all the way to the
 * left if that user has the card so it's front and center. My goal is to
 * not make things too complicated." One ring, no second colour, the cards
 * you hold first, binders unchanged.
 *
 * The order is decided on the server, so the website and the app draw it
 * from the same data. These pin the helper, every server path that hands
 * out a row of somebody else's wanted cards, and the ring on the rows
 * that are all yours.
 */
const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );

/** One function's body, from its name to the brace that closes it. */
const fn = (source: string, name: string) => {
  const start = source.indexOf(name);
  expect(start, `${name} is gone`).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf("\n}\n", start));
};

describe("heldFirst", () => {
  const held = (card: { id: string; match: string | null }) => card.match !== null;

  it("puts the cards you hold first, each half in the order it came", () => {
    const cards = [
      { id: "a", match: null },
      { id: "b", match: "exact" },
      { id: "c", match: null },
      { id: "d", match: "other-printing" },
      { id: "e", match: "exact" },
    ];
    expect(heldFirst(cards, held).map((card) => card.id)).toEqual([
      "b",
      "d",
      "e",
      "a",
      "c",
    ]);
  });

  it("treats exact and another printing as the same ring", () => {
    const cards = [
      { id: "other", match: "other-printing" },
      { id: "exact", match: "exact" },
    ];
    expect(heldFirst(cards, held).map((card) => card.id)).toEqual(["other", "exact"]);
  });

  it("leaves a row with nothing held, or everything held, exactly as it was", () => {
    const none = [
      { id: "a", match: null },
      { id: "b", match: null },
    ];
    const all = [
      { id: "a", match: "exact" },
      { id: "b", match: "other-printing" },
    ];
    expect(heldFirst(none, held)).toEqual(none);
    expect(heldFirst(all, held)).toEqual(all);
    expect(heldFirst([], held)).toEqual([]);
  });

  it("returns a new array and never moves the one it was given", () => {
    const cards = [
      { id: "a", match: null },
      { id: "b", match: "exact" },
    ];
    const ordered = heldFirst(cards, held);
    expect(ordered).not.toBe(cards);
    expect(cards.map((card) => card.id)).toEqual(["a", "b"]);
  });

  it("is free of server-only imports, so the app's tests can read it", () => {
    const source = read("src/lib/matching/held-first.ts");
    expect(source).not.toContain("server-only");
    expect(source).not.toMatch(/^import /m);
  });
});

describe("the server orders every row of somebody else's wants", () => {
  const feed = read("src/lib/feed/repository.ts");

  it("a friend's hunt on a board: the helper replaced the inline sort", () => {
    const board = fn(feed, "async function boardWithHunts");
    expect(board).toContain("heldFirst(");
    expect(board).not.toContain("Number(Boolean(b.match))");
    expect(board.indexOf("heldFirst(")).toBeLessThan(
      board.indexOf("cards.slice(0, CARD_RAIL_CAP)"),
    );
  });

  it("a Flare with no board: ordered before the cap", () => {
    const area = fn(feed, "async function areaHuntsFor");
    expect(area).toContain("heldFirst(");
    expect(area.indexOf("heldFirst(")).toBeLessThan(
      area.indexOf("cards.slice(0, CARD_RAIL_CAP)"),
    );
  });

  it("a recent row: every card collected, ordered, and only then capped", () => {
    const recent = fn(feed, "async function recentItems");
    /* The old shape capped while collecting, so a card you hold posted
       twenty-first was never drawn. */
    expect(recent).not.toContain("existing.cards.length < CARD_RAIL_CAP");
    expect(recent).toContain(
      "const ordered = heldFirst(group.cards, (card) => card.match !== null);",
    );
    expect(recent.indexOf("heldFirst(group.cards")).toBeLessThan(
      recent.indexOf("ordered.slice(0, CARD_RAIL_CAP)"),
    );
    expect(recent).toContain(
      "group.more = Math.max(0, ordered.length - CARD_RAIL_CAP);",
    );
  });

  it("a post's cards: held first, then found last, on the post page", () => {
    const posts = read("src/lib/feed/posts.ts");
    const detail = fn(posts, "export async function postDetail");
    expect(detail).toContain("const postCards = heldFirst(");
    expect(detail).toContain("[...postCards].sort(foundLast)");
  });

  it("their Flares on the night-player view", () => {
    const night = fn(
      read("src/lib/events/night-matches.ts"),
      "export async function nightPlayer",
    );
    expect(night).toContain("const flares = heldFirst(");
    expect(night).toContain("match: youHold(entry)");
    /* Wants only, graded the way the They want row grades. */
    expect(night).toContain('entry.intent !== "want"');
    expect(night).toContain("printingMatch(");
  });

  it("Looking for on another player's profile, wants only", () => {
    const profile = read("src/lib/players/profile.ts");
    expect(profile).toContain("const open = heldFirst(");
    expect(profile).toContain("[...open, ...offerings]");
    expect(profile).toContain(
      'match: (row.direction ?? "want") === "want" ? matchOf(row) : null',
    );
    /* Your own profile matches nothing. */
    expect(profile).toContain("if (!viewerId || viewerId === playerId) return null;");
  });
});

describe("the ring on a row that is all yours", () => {
  it("web: the They want row passes the card's own match, the other row none", () => {
    const thumbs = read("src/components/events/mutual-match.tsx");
    expect(thumbs).toContain("match={held ? card.match : null}");
    expect(thumbs).toMatch(/cards=\{match\.theyWant\}[\s\S]*?\bheld\s*\/>/);
    expect(thumbs).not.toMatch(/cards=\{match\.youWant\}[^/]*\bheld\b/);

    const player = read("src/components/events/night-player.tsx");
    expect(player).toMatch(/cards=\{view\.theyWant\}[\s\S]*?\bheld\s*\/>/);
    expect(player).not.toMatch(/cards=\{view\.theyHave\}[^/]*\bheld\b/);
    /* Their Flares carry the server's match rather than null. */
    expect(player).toContain("match: entry.match,");
  });

  it("app: the They want row passes the card's own match, the other row none", () => {
    const thumbs = read("mobile/src/mutual-match.tsx");
    expect(thumbs).toContain("<HeldRing match={held ? card.match : null} />");
    expect(thumbs).toContain(
      "<ThumbRow label={THEY_WANT} cards={match.theyWant} held />",
    );
    expect(thumbs).toContain("<ThumbRow label={YOU_WANT} cards={match.youWant} />");

    const player = read("mobile/src/screens/night-player.tsx");
    expect(player).toContain(
      "<ThumbRow label={THEY_WANT} cards={view.theyWant} width={56} held />",
    );
    expect(player).toContain(
      "<ThumbRow label={THEY_HAVE} cards={view.theyHave} width={56} />",
    );
    expect(player).toContain("<HeldRing match={f.match} />");
  });

  it("app: every surface that draws a held want with CardImage wears the ring", () => {
    for (const path of [
      "mobile/src/card-rail.tsx",
      "mobile/src/flare-deck-pager.tsx",
      "mobile/src/flare-feed-card-compact.tsx",
      "mobile/src/nearby.tsx",
      "mobile/src/profile-flares.tsx",
      "mobile/src/screens/home.tsx",
      "mobile/src/screens/night-matches.tsx",
    ]) {
      expect(read(path), path).toContain("<HeldRing match=");
    }
  });

  it("app: one ring, the accent, the website's two corner icons", () => {
    const ring = read("mobile/src/held-ring.tsx");
    expect(ring).toContain("borderColor: colors.accent");
    expect(ring).toContain('"package-variant-closed-check"');
    expect(ring).toContain('"layers-outline"');
    /* Read by these tests in node: never the API module. */
    expect(ring).not.toContain('from "./api"');
  });

  it("web: a held want on a profile's grid wears the ring", () => {
    const grid = read("src/components/players/profile-flares.tsx");
    expect(grid).toContain("{flare.match && (");
    expect(grid).toContain("ring-2 ring-accent ring-inset");
  });
});
