import { describe, expect, it } from "vitest";

import { dealWallShare, FREE_WALL_SHARE } from "@/lib/event-hub/wall-share";

/**
 * The wall deals cards out by person, not by who posted last.
 *
 * The founder asked what a hundred Flares does to FlareCast. Before:
 * the newest 24 cards in the room, so one big list owned the wall.
 * Now: everyone's first, everyone's second, and so on, each person
 * bringing at most their share.
 */
type Card = { id: string; owner: string | null };

const hand = (owner: string | null, n: number): Card[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${owner ?? "shared"}-${i}`, owner }));

const ownerOf = (card: Card) => card.owner;

describe("dealWallShare", () => {
  it("deals round-robin so three small lists survive a hundred-card one", () => {
    const cards = [
      ...hand("big", 100),
      ...hand("a", 2),
      ...hand("b", 2),
      ...hand("c", 2),
    ];
    const dealt = dealWallShare(cards, ownerOf, () => Infinity, 24);
    expect(dealt).toHaveLength(24);
    for (const owner of ["a", "b", "c"]) {
      expect(dealt.filter((card) => card.owner === owner)).toHaveLength(2);
    }
    expect(dealt.filter((card) => card.owner === "big")).toHaveLength(18);
    /* Everyone's first card comes before anybody's second. */
    expect(dealt.slice(0, 4).map((card) => card.owner)).toEqual(["big", "a", "b", "c"]);
  });

  it("caps a free account at its share and lets Pro bring everything", () => {
    const cards = [...hand("free", 40), ...hand("pro", 40)];
    const dealt = dealWallShare(
      cards,
      ownerOf,
      (owner) => (owner === "pro" ? Infinity : FREE_WALL_SHARE),
      24,
    );
    expect(dealt.filter((card) => card.owner === "free")).toHaveLength(FREE_WALL_SHARE);
    expect(dealt.filter((card) => card.owner === "pro")).toHaveLength(14);
  });

  it("leads with cards several people want", () => {
    const cards = [...hand("a", 3), ...hand(null, 2), ...hand("b", 3)];
    const dealt = dealWallShare(cards, ownerOf, () => Infinity, 24);
    expect(dealt.slice(0, 2).every((card) => card.owner === null)).toBe(true);
    expect(dealt).toHaveLength(8);
  });

  it("keeps each person's own order", () => {
    const cards = hand("a", 5);
    expect(dealWallShare(cards, ownerOf, () => Infinity, 3).map((c) => c.id)).toEqual([
      "a-0",
      "a-1",
      "a-2",
    ]);
  });

  it("is ten for free, and the wall reads the tier for the rest", () => {
    expect(FREE_WALL_SHARE).toBe(10);
  });
});
