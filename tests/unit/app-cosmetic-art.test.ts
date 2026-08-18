import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  AURA_ART,
  hasAuraArt,
  hasRingArt,
  RING_ART,
} from "../../mobile/src/cosmetic-art-data";

/**
 * The rings and auras a phone draws, against the stylesheet that
 * defines them.
 *
 * The app had no way to draw a catalogue cosmetic at all until now — a
 * conic gradient spun by keyframes has no React Native equivalent — so
 * a ring somebody spent Embers on came out as a flat band of colour.
 * Skia draws them now, from a table extracted out of
 * `src/app/cosmetic-art.css`.
 *
 * Extracted rather than transcribed, because twenty-five rings of
 * hand-copied hex is twenty-five chances to be subtly wrong about
 * somebody's purchase. This is what keeps the copy honest: the
 * stylesheet stays the source of truth, and adding a ring to the web
 * without giving the app its art fails here rather than shipping as a
 * flat band nobody notices.
 */

const css = readFileSync(
  resolve(import.meta.dirname, "../../src/app/cosmetic-art.css"),
  "utf8",
);

/** Every slug of one family the stylesheet actually styles. */
function slugsIn(family: "ring" | "aura"): string[] {
  const found = css.matchAll(new RegExp(`\\.cfa-(${family}-[a-z0-9-]+)`, "g"));
  return [...new Set([...found].map((match) => match[1]))].sort();
}

describe("the ring table", () => {
  const slugs = slugsIn("ring");

  it("covers every ring the website styles", () => {
    expect(slugs.length).toBeGreaterThan(20);
    expect(Object.keys(RING_ART).sort()).toEqual(slugs);
  });

  it.each(slugsIn("ring"))("%s turns at the web's own period", (slug) => {
    /* A ring that spins at 3.6s on a laptop and 5s on a phone is two
       different products with one name. */
    const rule = new RegExp(
      `\\.cfa-${slug}\\s+\\.cfx-ring-band::before\\s*\\{[^}]*animation:\\s*cfa-[a-z-]+\\s+([0-9.]+)s`,
      "m",
    ).exec(css);

    expect(RING_ART[slug].spinSeconds).toBe(rule ? Number(rule[1]) : null);
  });

  it.each(slugsIn("ring"))("%s has a sweep Skia will accept", (slug) => {
    const { colors, positions } = RING_ART[slug];

    /* Skia wants one position per colour, non-decreasing, spanning the
       whole turn. A gradient that stops short leaves a visible seam. */
    expect(colors.length).toBe(positions.length);
    expect(colors.length).toBeGreaterThan(1);
    expect(positions[0]).toBe(0);
    expect(positions[positions.length - 1]).toBe(1);

    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1]);
    }

    for (const colour of colors) {
      expect(colour).toMatch(/^(#[0-9a-fA-F]{3,8}|rgba?\()/);
    }
  });

  it("keeps a hard-banded ring's stops paired", () => {
    /* CSS `#aaa 8% 16%` is a BAND, not a point, and it becomes two Skia
       stops at one colour. Frozen is the one that proves the converter
       understood the difference. */
    const frozen = RING_ART["ring-frozen"];

    expect(frozen.colors.length).toBeGreaterThan(10);
    expect(frozen.colors[1]).toBe(frozen.colors[0]);
  });
});

describe("the aura table", () => {
  it("covers every aura the website styles", () => {
    expect(Object.keys(AURA_ART).sort()).toEqual(slugsIn("aura"));
  });

  it.each(slugsIn("aura"))("%s moves at the web's own period", (slug) => {
    const rule = new RegExp(
      `\\.cfa-${slug}\\s+\\.cfx-aura-fx\\s*\\{[^}]*animation:\\s*cfa-([a-z-]+)\\s+([0-9.]+)s`,
      "m",
    ).exec(css);

    expect(rule).not.toBeNull();
    expect(AURA_ART[slug].seconds).toBe(Number(rule![2]));
    expect(AURA_ART[slug].motion).toBe(rule![1]);
  });

  it.each(slugsIn("aura"))("%s draws a sensible number of particles", (slug) => {
    /* Every aura on screen is one shared clock, but the particles are
       still draw calls, and a room roster can hold a dozen avatars. */
    const art = AURA_ART[slug];

    expect(art.count).toBeGreaterThan(0);
    expect(art.count).toBeLessThanOrEqual(20);
    expect(art.opacity).toBeGreaterThan(0);
    expect(art.opacity).toBeLessThanOrEqual(1);
  });
});

describe("what the app still approximates", () => {
  it("says so, rather than guessing", () => {
    /* The two hundred cosmetics that are not rings or auras keep their
       flat-colour stand-in, and these are what the avatar checks to
       decide. A slug with no art must answer false, not throw. */
    expect(hasRingArt("ring-inferno")).toBe(true);
    expect(hasAuraArt("aura-sparks")).toBe(true);

    expect(hasRingArt("border-neon")).toBe(false);
    expect(hasAuraArt("pattern-holo")).toBe(false);
    expect(hasRingArt(null)).toBe(false);
    expect(hasAuraArt(null)).toBe(false);
  });
});
