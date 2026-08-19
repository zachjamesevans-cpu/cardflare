import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  AURA_INSET,
  AURA_ORBIT,
  FILM_SCALE,
  RING_BAND,
  RING_INSET,
  auraLayer,
  filmLayer,
  ringLayer,
} from "../../mobile/src/avatar-geometry";

/**
 * Where the app puts a worn cosmetic, against where the website puts it.
 *
 * This exists because the first native pass got it wrong in a way no
 * type and no typecheck could catch. The ring was stroked at a radius
 * INSIDE the avatar and drawn underneath an opaque face, so twenty-five
 * rings people had spent Embers on were not dim, or flat, or slightly
 * off: they were invisible, and the app reported success. The aura
 * orbited inside the picture too, which is what the founder saw on a
 * real phone: "I can kinda see the animated hearts on an avatar, but
 * they're behind the avatar."
 *
 * The website expresses all of this as insets and masks in
 * `src/app/cosmetic-art.css`. React Native has neither, so the app
 * arrives at the same places by arithmetic — and arithmetic against a
 * stylesheet is exactly the kind of thing that can be checked here
 * instead of on a device three days later.
 *
 * Read off the source, because this project's test runner is Node with
 * no renderer (see vitest.config.ts). That is a real limit and worth
 * naming: this proves the numbers are RIGHT and the layers are in the
 * right order in the source. It does not prove a phone drew them. The
 * visual pass is a simulator or a build on a device — see
 * mobile/TESTING.md.
 */

const css = readFileSync(
  resolve(import.meta.dirname, "../../src/app/cosmetic-art.css"),
  "utf8",
);

/** The `inset` a rule sets, as the string the stylesheet wrote. */
function inset(selector: string): string {
  const rule = new RegExp(`\\${selector}\\s*\\{[^}]*inset:\\s*([^;]+);`, "m").exec(css);

  expect(rule, `${selector} has no inset`).not.toBeNull();
  return rule![1].trim();
}

describe("the numbers, against the stylesheet", () => {
  it("puts the ring layer four points proud, like .cfx-ring-avatar", () => {
    expect(inset(".cfx-ring-avatar")).toBe(`-${RING_INSET}px`);
  });

  it("keeps the band at the two points the founder settled on", () => {
    /* "far too thick" was said about three. The mask leaves the outer
       2px of the layer, and that IS the band. */
    const mask =
      /\.cfx-ring-avatar \.cfx-ring-band \{[^}]*transparent calc\(100% - (\d+)px\)/m.exec(
        css,
      );

    expect(mask).not.toBeNull();
    expect(Number(mask![1])).toBe(RING_BAND);
  });

  it("scales a dropped-in file by 400/296, like .cfx-ring-film", () => {
    const percent = Number(inset(".cfx-ring-film").replace(/[-%]/g, ""));

    expect(1 + (percent / 100) * 2).toBeCloseTo(FILM_SCALE, 4);
  });

  it("spreads the aura layer wider than the ring, like .cfx-aura-avatar", () => {
    expect(inset(".cfx-aura-avatar")).toBe(`-${AURA_INSET * 100}%`);

    /* Wider than the ring layer at every size, which is what stops a
       ring and an effect worn together from sitting on each other. */
    expect(auraLayer(96).box).toBeGreaterThan(ringLayer(96).box);
  });
});

/** Every size the app actually draws an avatar at, plus the extremes. */
const SIZES = [24, 32, 40, 48, 64, 96, 120];

describe("the ring", () => {
  it.each(SIZES)("at %ipx, never touches the picture", (size) => {
    const { radius, strokeWidth } = ringLayer(size);

    /* The whole failure, as one assertion: the band's INNER edge has to
       be outside the picture's edge, or the face is drawn over a ring
       somebody paid for. */
    expect(radius - strokeWidth / 2).toBeGreaterThan(size / 2);
  });

  it.each(SIZES)("at %ipx, lands on the web's own band", (size) => {
    const { radius, strokeWidth } = ringLayer(size);

    /* Two points of gap, then two points of colour: the same geometry
       the legacy box-shadow frames had, and the same the flat-colour
       fallback in PlayerAvatar still draws with borderWidth 2 on a box
       of size + 8. Those two must not disagree. */
    expect(radius - strokeWidth / 2).toBe(size / 2 + 2);
    expect(radius + strokeWidth / 2).toBe(size / 2 + 4);
  });

  it.each(SIZES)("at %ipx, sits inside the box it is given", (size) => {
    const { box, offset, radius, strokeWidth } = ringLayer(size);

    expect(radius + strokeWidth / 2).toBeLessThanOrEqual(box / 2);
    /* Pulled back by exactly half the growth, or the ring is centred on
       something that is not the picture. */
    expect(offset).toBe((box - size) / 2);
  });
});

describe("the aura", () => {
  it.each(SIZES)("at %ipx, orbits outside the picture", (size) => {
    /* The founder's report, as an assertion. Anything at or under
       size / 2 is behind a face. */
    expect(auraLayer(size).orbit).toBeGreaterThan(size / 2);
  });

  it.each(SIZES)("at %ipx, orbits inside its own canvas", (size) => {
    const { box, centre, orbit } = auraLayer(size);

    /* Rise and fall travel a full orbit above and below centre, so the
       canvas has to hold centre + orbit as well as centre + orbit
       sideways, or Skia clips particles into a hard edge. */
    expect(centre + orbit).toBeLessThan(box);
    expect(centre - orbit).toBeGreaterThan(0);
  });

  it("stays in the band the website's mask leaves visible", () => {
    /* `transparent 52%, #000 70%` of the layer's half-width: nothing
       shows before 0.70, so the app's single orbit belongs at or past
       where the web's particles become solid. */
    const mask =
      /\.cfx-aura-avatar \.cfx-aura-fx \{[^}]*transparent (\d+)%, #000 (\d+)%/m.exec(
        css,
      );

    expect(mask).not.toBeNull();

    const half = (1 + AURA_INSET * 2) / 2;
    const solid = (Number(mask![2]) / 100) * half;

    expect(AURA_ORBIT).toBeGreaterThanOrEqual(solid);
    expect(AURA_ORBIT).toBeLessThanOrEqual(half);
  });
});

describe("a dropped-in file", () => {
  it.each(SIZES)("at %ipx, puts art radius 148 on the picture's edge", (size) => {
    const { box } = filmLayer(size);

    /* Art is authored in a 400 box with the picture filling out to
       radius 148. If this drifts, uploaded ring art starts digging into
       faces, which is the thing the founder has asked for twice. */
    expect((148 / 400) * box).toBeCloseTo(size / 2, 6);
  });
});
