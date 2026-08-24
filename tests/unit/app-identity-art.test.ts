import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BADGE_ART,
  NAME_ART,
  TITLE_ART,
  hasBadgeArt,
  hasNameArt,
  hasTitleArt,
} from "../../mobile/src/cosmetic-art-data";
import * as web from "../../src/lib/players/worn-words";
import * as app from "../../mobile/src/worn-words";

/**
 * The identity cosmetics a phone draws - name styles, badges, titles -
 * against the stylesheet and the words the website uses.
 *
 * Twenty-eight cosmetics that ARE somebody's profile identity, and
 * until this family none of them existed on a phone at all. Same
 * contract as every ported family: generated from the stylesheet, so a
 * new name style added to the web without re-running the generator
 * fails here instead of shipping as plain text nobody notices.
 */

const css = readFileSync(
  resolve(import.meta.dirname, "../../src/app/cosmetic-art.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

const slugsOf = (family: string) =>
  [
    ...new Set(
      [...css.matchAll(new RegExp(`\\.cfa-(${family}-[a-z0-9-]+)`, "g"))].map(
        (match) => match[1],
      ),
    ),
  ].sort();

describe("coverage", () => {
  it("draws every name style the website styles", () => {
    expect(Object.keys(NAME_ART).sort()).toEqual(slugsOf("name"));
    expect(Object.keys(NAME_ART).length).toBe(13);
  });

  it("draws every badge and every title", () => {
    expect(Object.keys(BADGE_ART).sort()).toEqual(slugsOf("badge"));
    expect(Object.keys(TITLE_ART).sort()).toEqual(slugsOf("title"));
  });

  it("answers false for a slug it has no art for", () => {
    expect(hasNameArt("name-gold-name")).toBe(true);
    expect(hasNameArt("ring-inferno")).toBe(false);
    expect(hasBadgeArt(null)).toBe(false);
    expect(hasTitleArt("title-founder")).toBe(true);
  });
});

describe("the name fills", () => {
  it("keeps every gradient in Skia's shape", () => {
    for (const [slug, art] of Object.entries(NAME_ART)) {
      if (art.fill.type !== "gradient") continue;

      expect(art.fill.colors.length, slug).toBe(art.fill.positions.length);
      expect(art.fill.positions[0], slug).toBe(0);
      expect(art.fill.positions[art.fill.positions.length - 1], slug).toBe(1);
      expect(art.fill.spread, slug).toBeGreaterThanOrEqual(1);
    }
  });

  it("knows which names travel", () => {
    /* Shimmer and Holographic pan their paint; a panning gradient with
       no extra paint to pan through would shimmer nothing. */
    for (const [slug, art] of Object.entries(NAME_ART)) {
      if (art.motion?.kind === "pan") {
        expect(art.fill.type, slug).toBe("gradient");
        if (art.fill.type === "gradient") {
          expect(art.fill.spread, slug).toBeGreaterThan(1);
        }
      }
    }
  });

  it("keeps the font swaps", () => {
    expect(NAME_ART["name-pixel-font"].font).toBe("mono");
    expect(NAME_ART["name-manga-font"].font).toBe("serif");
    expect(NAME_ART["name-manga-font"].italic).toBe(true);
  });
});

describe("the words", () => {
  it("says the same thing on both platforms", () => {
    /* A badge that says ♛ on the website and ✦ in the app is two
       different honours with one name. */
    expect(app.TITLE_WORDS).toEqual(web.TITLE_WORDS);
    expect(app.BADGE_MARKS).toEqual(web.BADGE_MARKS);
    expect(app.BADGE_MARK_FALLBACK).toBe(web.BADGE_MARK_FALLBACK);
  });

  it("derives unknown titles the same way", () => {
    for (const slug of ["title-founder", "title-night-owl", "title-og-collector"]) {
      expect(app.titleWords(slug)).toBe(web.titleWords(slug));
    }
  });

  it("has a mark for every badge that has art", () => {
    for (const slug of Object.keys(BADGE_ART)) {
      expect(web.BADGE_MARKS[slug], slug).toBeDefined();
    }
  });
});
