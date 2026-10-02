import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  AURA_ART,
  BACKGROUND_ART,
  hasAuraArt,
  hasBackgroundArt,
  hasPatternArt,
  hasRingArt,
  PATTERN_ART,
  RING_ART,
  TEXTURE_ART,
  type PaintLayer,
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
function slugsIn(family: "ring" | "aura" | "pattern" | "bg"): string[] {
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

  it.each(slugsIn("aura"))("%s draws the shape the website scatters", (slug) => {
    /*
     * WHAT the particle is, not just how it moves. Every aura used to
     * be the same filled circle in a different colour, so Hearts
     * reached a real phone as a pink dot and Snow as a white one -
     * eight cosmetics drawn as one speck. The shape now comes out of
     * the stylesheet with the rest of the numbers, and the first
     * `--cfa-p-*` layer is the one that names the effect.
     */
    const rule = new RegExp(
      `\\.cfa-${slug}\\s+\\.cfx-aura-fx\\s*\\{[^}]*background-image:\\s*var\\(--cfa-p-([a-z-]+)\\)`,
      "m",
    ).exec(css);

    expect(rule).not.toBeNull();
    expect(AURA_ART[slug].shape).toBe(rule![1]);
  });

  it("has a drawn path for every shape in the table", () => {
    /* The data can name a shape the renderer has never heard of, and
       the fallback for that is the plain circle this whole change
       exists to get rid of. The generator refuses an unknown shape;
       this is the other half, read off the app's own source. */
    const worn = readFileSync(
      resolve(import.meta.dirname, "../../mobile/src/cosmetic-worn.tsx"),
      "utf8",
    );

    for (const slug of slugsIn("aura")) {
      expect(worn).toMatch(new RegExp(`\\b${AURA_ART[slug].shape}: \\{`));
    }
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

/**
 * Holo patterns and showcase backgrounds: CSS background stacks, read
 * back as layers Skia can paint. The website lists a stack top first;
 * the app paints bottom first, so the table is reversed and the
 * stylesheet's LAST layer is the table's FIRST.
 */
const BLENDS = ["normal", "screen", "overlay", "colorDodge", "multiply", "luminosity"];
const MOTIONS = [
  "pan",
  "pan-y",
  "rise",
  "fall",
  "drift",
  "twinkle",
  "pulse",
  "flicker",
  "jitter",
  "hue",
];

function layersSound(layers: PaintLayer[]) {
  expect(layers.length).toBeGreaterThan(0);
  for (const layer of layers) {
    if ("colors" in layer) {
      expect(layer.colors.length).toBe(layer.positions.length);
      for (let i = 1; i < layer.positions.length; i += 1) {
        expect(layer.positions[i]).toBeGreaterThanOrEqual(layer.positions[i - 1]);
      }
    }
    if (layer.type === "texture") expect(TEXTURE_ART[layer.name]).toBeDefined();
    if ("place" in layer && layer.place) {
      for (const len of [layer.place.x, layer.place.y]) {
        expect(len === "auto" || "px" in len || "frac" in len).toBe(true);
      }
    }
  }
}

describe("the pattern table", () => {
  const slugs = slugsIn("pattern");

  it("covers every holo pattern the website styles", () => {
    expect(slugs.length).toBeGreaterThan(30);
    expect(Object.keys(PATTERN_ART).sort()).toEqual(slugs);
  });

  it.each(slugsIn("pattern"))("%s blends and moves as the website does", (slug) => {
    const art = PATTERN_ART[slug];
    layersSound(art.layers);
    expect(BLENDS).toContain(art.blend);
    expect(art.opacity).toBeGreaterThan(0);
    expect(art.opacity).toBeLessThanOrEqual(1);

    const rule = new RegExp(
      `\\.cfa-${slug}\\s+\\.cfx-card-fx\\s*\\{[^}]*animation:\\s*cfa-([a-z-]+)\\s+([0-9.]+)s`,
      "m",
    ).exec(css);
    if (rule) {
      expect(art.motion?.kind).toBe(rule[1]);
      expect(art.motion?.seconds).toBe(Number(rule[2]));
      expect(MOTIONS).toContain(rule[1]);
    } else {
      expect(art.motion).toBeNull();
    }
  });

  it("keeps the stylesheet's bottom layer first", () => {
    /* Galaxy: dots on top in CSS, three nebulae beneath. */
    const galaxy = PATTERN_ART["pattern-galaxy"].layers;
    expect(galaxy[galaxy.length - 1].type).toBe("texture");
    expect(galaxy[0].type).toBe("radial");
  });

  it("knows which patterns a phone can paint", () => {
    expect(hasPatternArt("pattern-classic-rainbow")).toBe(true);
    expect(hasPatternArt("pattern-hearts")).toBe(true);
    /* Text glyphs have no path to read back. */
    expect(hasPatternArt("pattern-matrix-rain")).toBe(false);
    expect(hasPatternArt(null)).toBe(false);
  });
});

describe("the background table", () => {
  const slugs = slugsIn("bg");

  it("covers every showcase background the website styles", () => {
    expect(slugs.length).toBeGreaterThan(25);
    expect(Object.keys(BACKGROUND_ART).sort()).toEqual(slugs);
  });

  it.each(slugsIn("bg"))("%s is a stack Skia can paint", (slug) => {
    const art = BACKGROUND_ART[slug];
    layersSound(art.layers);
    if (art.motion) expect(MOTIONS).toContain(art.motion.kind);
  });

  it("reads a flat colour as its own layer, and the storm's flash", () => {
    expect(BACKGROUND_ART["bg-black-void"].layers).toEqual([
      { type: "solid", color: "#05060a" },
    ]);
    expect(BACKGROUND_ART["bg-lightning-storm"].flash?.seconds).toBe(5);
    expect(hasBackgroundArt("bg-sunset")).toBe(true);
  });
});

describe("the textures", () => {
  it("read every --cfa-p-* mark back as a path, bar the text glyphs", () => {
    const names = [...css.matchAll(/--cfa-p-([a-z0-9-]+):/g)].map((m) => m[1]);
    expect(Object.keys(TEXTURE_ART).sort()).toEqual([...new Set(names)].sort());
    for (const name of names) {
      const texture = TEXTURE_ART[name];
      expect(texture.viewBox.w).toBeGreaterThan(0);
      if (name === "glyph") {
        expect(texture.marks).toEqual([]);
        continue;
      }
      expect(texture.marks.length).toBeGreaterThan(0);
      for (const mark of texture.marks) {
        expect(mark.d).toMatch(/^M/);
        expect(mark.fill !== null || mark.stroke !== null).toBe(true);
      }
    }
  });
});

describe("what the app still approximates", () => {
  it("says so, rather than guessing", () => {
    /* Card animations and profile scenes keep their stand-in, and
       these are what the screens check to decide. A slug with no art
       must answer false, not throw. */
    expect(hasRingArt("ring-inferno")).toBe(true);
    expect(hasAuraArt("aura-sparks")).toBe(true);

    expect(hasRingArt("border-neon")).toBe(false);
    expect(hasAuraArt("pattern-holo")).toBe(false);
    expect(hasPatternArt("anim-sparkle")).toBe(false);
    expect(hasBackgroundArt("scene-rain")).toBe(false);
    expect(hasRingArt(null)).toBe(false);
    expect(hasAuraArt(null)).toBe(false);
  });
});
