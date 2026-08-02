import { describe, expect, it } from "vitest";

import { pickBasePrinting, type CardPrinting } from "@/lib/cards/schema";

/**
 * Which printing stands in when a Flare says "any printing".
 *
 * It used to be none, so those rows showed no artwork at all — the one case
 * where a picture helps most, since somebody who will take any version is
 * usually picturing the ordinary one.
 */
const IMAGE = "https://optcgapi.com/media/static/Card_Images/OP12-034.jpg";

const printing = (over: Partial<CardPrinting> = {}): CardPrinting => ({
  id: crypto.randomUUID(),
  setCode: "OP12",
  setName: "Legacy of the Master",
  printingLabel: "OP12",
  variantType: null,
  rarity: "C",
  printingName: "Perona",
  isPromo: null,
  imageUrl: IMAGE,
  ...over,
});

describe("pickBasePrinting", () => {
  it("has nothing to pick from an empty list", () => {
    expect(pickBasePrinting([], "Perona")).toBeNull();
  });

  it("returns the only printing there is", () => {
    const only = printing();

    expect(pickBasePrinting([only], "Perona")).toBe(only);
  });

  /*
   * The signal that works even for Leaders, where every printing is rarity L
   * and only the name separates them.
   */
  it("prefers the printing named exactly like the card", () => {
    const base = printing({ printingName: "Kouzuki Oden", rarity: "L" });
    const spr = printing({ printingName: "Kouzuki Oden (SPR)", rarity: "L" });

    expect(pickBasePrinting([spr, base], "Kouzuki Oden")).toBe(base);
  });

  it("prefers the plainest rarity", () => {
    const common = printing({ rarity: "C" });
    const secret = printing({ rarity: "SEC" });

    expect(pickBasePrinting([secret, common], "Perona")).toBe(common);
  });

  /* A promo of a card is the least ordinary version of it. */
  it("avoids a promo when an ordinary printing exists", () => {
    const promo = printing({ isPromo: true, rarity: "C" });
    const ordinary = printing({ isPromo: null, rarity: "SR" });

    expect(pickBasePrinting([promo, ordinary], "Perona")).toBe(ordinary);
  });

  /*
   * The point of the whole exercise is to show a picture. A perfectly chosen
   * base printing with no artwork shows nothing, which is the bug.
   */
  it("takes a printing that has artwork over a plainer one that does not", () => {
    const plainNoArt = printing({ rarity: "C", imageUrl: null });
    const rareWithArt = printing({ rarity: "SEC", imageUrl: IMAGE });

    expect(pickBasePrinting([plainNoArt, rareWithArt], "Perona")).toBe(rareWithArt);
  });

  it("still picks something when nothing has artwork", () => {
    const a = printing({ rarity: "SEC", imageUrl: null });
    const b = printing({ rarity: "C", imageUrl: null });

    expect(pickBasePrinting([a, b], "Perona")).toBe(b);
  });

  /* An unfamiliar rarity code must not be treated as the plainest. */
  it("sorts an unrecognised rarity after the known ones", () => {
    const known = printing({ rarity: "SR" });
    const unknown = printing({ rarity: "???" });

    expect(pickBasePrinting([unknown, known], "Perona")).toBe(known);
  });

  it("breaks a remaining tie on set code, so the choice is stable", () => {
    const later = printing({ setCode: "OP12" });
    const earlier = printing({ setCode: "OP01" });

    expect(pickBasePrinting([later, earlier], "Perona")).toBe(earlier);
    expect(pickBasePrinting([earlier, later], "Perona")).toBe(earlier);
  });

  it("does not reorder the caller's array", () => {
    const list = [printing({ rarity: "SEC" }), printing({ rarity: "C" })];
    const before = [...list];

    pickBasePrinting(list, "Perona");

    expect(list).toEqual(before);
  });
});
