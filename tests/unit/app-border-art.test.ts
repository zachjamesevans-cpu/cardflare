import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { BORDER_ART, hasBorderArt } from "../../mobile/src/cosmetic-art-data";

/**
 * The 43 card borders a phone draws, against the stylesheet that
 * defines them.
 *
 * The biggest catalogue family, on every card in a showcase, and until
 * now the app drew none of them - it dressed cards with the nine legacy
 * frames and never learned the other forty-three existed.
 *
 * Extracted rather than transcribed, by
 * `scripts/extract-cosmetic-art.mjs`. Forty-three borders of
 * hand-copied hex is forty-three chances to be subtly wrong about
 * somebody's purchase, and the two families that WERE done by hand had
 * three rings quietly wrong in them: Manga, Pixel and Retro Arcade are
 * repeating sweeps, and the hand copy read one wedge as the whole turn,
 * so a twelve-stripe ring rendered as four smeared colours.
 */

const css = readFileSync(
  resolve(import.meta.dirname, "../../src/app/cosmetic-art.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

/** Every border slug the stylesheet actually styles. */
const slugs = [
  ...new Set([...css.matchAll(/\.cfa-(border-[a-z0-9-]+)/g)].map((m) => m[1])),
].sort();

describe("the border table", () => {
  it("covers every border the website styles", () => {
    expect(slugs.length).toBe(43);
    expect(Object.keys(BORDER_ART).sort()).toEqual(slugs);
  });

  it.each(slugs)("%s has a gradient Skia will accept", (slug) => {
    const { base } = BORDER_ART[slug];

    /* Skia wants one position per colour, non-decreasing, spanning the
       whole run. A gradient that stops short leaves a visible band of
       flat colour where the web holds the last stop. */
    expect(base.colors.length).toBe(base.positions.length);
    expect(base.colors.length).toBeGreaterThan(1);
    expect(base.positions[0]).toBe(0);
    expect(base.positions[base.positions.length - 1]).toBe(1);

    for (let i = 1; i < base.positions.length; i += 1) {
      expect(base.positions[i]).toBeGreaterThanOrEqual(base.positions[i - 1]);
    }

    for (const colour of base.colors) {
      /* The bug this catches is specific and was real: scanning a stop
         for a trailing bare zero turns `#ef3ef0` into `#ef3ef`, which
         is a colour Skia will happily draw as something else. */
      expect(colour).toMatch(/^(#[0-9a-fA-F]{3,8}|rgba?\()/);
      if (colour.startsWith("#")) {
        expect([4, 5, 7, 9]).toContain(colour.length);
      }
    }
  });

  it.each(slugs)("%s moves at the web's own period", (slug) => {
    const rule = new RegExp(
      `\\.cfa-${slug}\\s*\\{[^}]*animation:\\s*cfa-([a-z-]+)\\s+([0-9.]+)s([^;]*)`,
      "m",
    ).exec(css);

    const motion = BORDER_ART[slug].motion;

    if (!rule) {
      expect(motion).toBeNull();
      return;
    }

    /* A border that pans in five seconds on a laptop and nine on a
       phone is two products with one name. */
    expect(motion).not.toBeNull();
    expect(motion!.kind).toBe(rule[1]);
    expect(motion!.seconds).toBe(Number(rule[2]));
    expect(motion!.alternate).toBe(/\balternate\b/.test(rule[3]));
  });

  it("only asks the app to draw motions the app has", () => {
    /* Four kinds today: pan, pan-y, pulse, jitter. A fifth appearing in
       the stylesheet would extract cleanly and then silently hold
       still, which is the failure mode this catches. */
    const drawn = new Set(["pan", "pan-y", "pulse", "jitter"]);
    for (const [slug, art] of Object.entries(BORDER_ART)) {
      if (art.motion) expect(drawn, `${slug}`).toContain(art.motion.kind);
    }
  });

  it("splits a glow from a hairline", () => {
    /* An `inset` box-shadow is a line ON the edge; an outer one is a
       glow AROUND it. Classic Black has the first and no second, and
       drawing its hairline as a glow would put a white halo round a
       border whose whole idea is that it is black. */
    expect(BORDER_ART["border-classic-black"].glow).toBeNull();
    expect(BORDER_ART["border-classic-black"].hairline).not.toBeNull();

    expect(BORDER_ART["border-gold"].glow).not.toBeNull();
    expect(BORDER_ART["border-gold"].hairline).toBeNull();
  });

  it("says which borders are still missing their texture", () => {
    /*
     * Eight borders layer a repeating particle image over the gradient
     * - Manga's hatching, Starfield's stars, Lightning's bolts - and
     * the app does not draw those yet. Naming them in the data is the
     * difference between a known gap and a border that quietly looks
     * wrong on a phone.
     */
    const missing = Object.entries(BORDER_ART)
      .filter(([, art]) => art.textures.length > 0)
      .map(([slug]) => slug);

    expect(missing).toEqual([
      "border-circuit-board",
      "border-cracked-stone",
      "border-galaxy",
      "border-gold-filigree",
      "border-lava-cracks",
      "border-lightning",
      "border-manga",
      "border-starfield",
    ]);

    /* And every name is a variable the stylesheet actually defines. */
    for (const [, art] of Object.entries(BORDER_ART)) {
      for (const texture of art.textures) {
        expect(css).toContain(`${texture}:`);
      }
    }
  });

  it("knows a slug it has no art for", () => {
    expect(hasBorderArt("border-gold")).toBe(true);
    expect(hasBorderArt("pattern-holo")).toBe(false);
    expect(hasBorderArt(null)).toBe(false);
  });
});

describe("the generator", () => {
  it("reproduces the committed table exactly", () => {
    /*
     * The point of generating this is that it cannot drift. Running the
     * extractor and finding a different file means somebody edited the
     * output by hand, or changed the stylesheet without re-running it -
     * and either way what the app draws has stopped matching what the
     * website draws.
     */
    const root = resolve(import.meta.dirname, "../..");
    const path = resolve(root, "mobile/src/cosmetic-art-data.ts");
    const before = readFileSync(path, "utf8");

    /* Restored whatever happens, so a failing assertion reports a
       problem rather than leaving one in the working tree. */
    try {
      execFileSync("node", ["scripts/extract-cosmetic-art.mjs"], { cwd: root });
      execFileSync("npx", ["prettier", "--write", path], {
        cwd: root,
        stdio: "ignore",
      });
      expect(readFileSync(path, "utf8")).toBe(before);
    } finally {
      writeFileSync(path, before);
    }
  }, 60_000);
});
