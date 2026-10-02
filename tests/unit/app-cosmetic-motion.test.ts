import { describe, expect, it } from "vitest";

import { MOTION_ART } from "../../mobile/src/cosmetic-art-data";
import {
  LINEAR,
  REST,
  curveFor,
  curveOf,
  ease,
  fades,
  poseAt,
  resolveTrack,
  trackFor,
} from "../../mobile/src/cosmetic-keyframes";

/**
 * The keyframes, played the way a browser plays them.
 *
 * The app reads the website's `@keyframes` back as tracks and
 * interpolates them itself, so the semantics are its own to get wrong:
 * easing applies per interval, a stop that names no transform is not
 * a transform keyframe, missing ends are the thing at rest. A shelf of
 * cards that ripple a beat differently from the website would be two
 * products with one name.
 *
 * `cosmetic-keyframes.ts` is pure TypeScript on purpose, so this can
 * import it (see mobile-imports.test.ts); the clock that drives it is
 * Reanimated, in cosmetic-motion.ts, and is read as text elsewhere.
 */

const BOX = { w: 100, h: 200 };

describe("the easings", () => {
  it("are CSS's named curves", () => {
    expect(ease(LINEAR, 0.3)).toBeCloseTo(0.3);
    const inOut = curveOf("ease-in-out", null);
    expect(ease(inOut, 0)).toBe(0);
    expect(ease(inOut, 0.5)).toBeCloseTo(0.5, 3);
    expect(ease(inOut, 1)).toBe(1);
    /* Symmetric: slow in, slow out. */
    expect(ease(inOut, 0.2)).toBeCloseTo(1 - ease(inOut, 0.8), 3);
    expect(ease(inOut, 0.2)).toBeLessThan(0.2);
    const easeIn = curveOf("ease-in", null);
    expect(ease(easeIn, 0.5)).toBeLessThan(0.5);
    const easeOut = curveOf("ease-out", null);
    expect(ease(easeOut, 0.5)).toBeGreaterThan(0.5);
  });

  it("step as the stylesheet's steps(n) do", () => {
    /* steps(1) holds the stop until the next: the glitch. */
    const hold = curveOf("steps", 1);
    expect(ease(hold, 0.99)).toBe(0);
    expect(ease(hold, 1)).toBe(1);
    /* steps(14): the pixel particles climb in fourteen jumps. */
    const pixel = curveOf("steps", 14);
    expect(ease(pixel, 0.5)).toBeCloseTo(7 / 14);
    expect(ease(pixel, 0.05)).toBe(0);
  });

  it("read a timing, and a border motion as linear", () => {
    expect(curveFor(null)).toEqual(LINEAR);
    expect(curveFor({ kind: "pan", seconds: 4, alternate: true })).toEqual(LINEAR);
    expect(
      curveFor({
        kind: "ripple",
        seconds: 2.6,
        alternate: false,
        easing: "ease-out",
        steps: null,
        delaySeconds: 0,
      }).shape,
    ).toBe(1);
  });
});

describe("a track, resolved", () => {
  it("interpolates a channel across the stops that do not mention it", () => {
    /* The shockwave: scale 0.35 -> 1.25 over 0 to 0.7, straight
       through the 0.55 stop that only dims the ring. */
    const shock = resolveTrack(MOTION_ART.shock, BOX);
    expect(shock.move.map((k) => k.at)).toEqual([0, 0.7, 1]);
    expect(shock.fade.map((k) => k.at)).toEqual([0, 0.55, 0.7, 1]);
    const mid = poseAt(shock, LINEAR, 0.35);
    expect(mid.scale).toBeCloseTo(0.35 + (1.25 - 0.35) * 0.5);
  });

  it("fills a missing end with the thing at rest", () => {
    /* Spin names no transform at 0%: it starts from rest. */
    const spin = resolveTrack(MOTION_ART.spin, BOX);
    expect(spin.move[0]).toMatchObject({ at: 0, rotate: 0, scale: 1 });
    expect(poseAt(spin, LINEAR, 0.25).rotate).toBeCloseTo(90);
    /* Dealin names only an opacity at 100%: its transform ends at rest. */
    const dealin = resolveTrack(MOTION_ART.dealin, BOX);
    expect(dealin.move[dealin.move.length - 1]).toMatchObject({
      at: 1,
      ty: 0,
      rotate: 0,
    });
    expect(dealin.fade[dealin.fade.length - 1]).toEqual({ at: 1, value: 0 });
  });

  it("resolves percent lengths against the thing's own box", () => {
    const sheen = resolveTrack(MOTION_ART.sheen, BOX);
    expect(sheen.move[0].tx).toBeCloseTo(-1.3 * BOX.w);
    expect(sheen.move[0].skewX).toBe(-18);
    const float = resolveTrack(MOTION_ART.float, BOX);
    expect(float.move[0].ty).toBeCloseTo(0.04 * BOX.h);
    expect(float.move[1].ty).toBeCloseTo(-0.04 * BOX.h);
    expect(resolveTrack(MOTION_ART.glitch, BOX).move[2].tx).toBe(-3);
  });

  it("splits rotate3d into its two leans", () => {
    const tilt = resolveTrack(MOTION_ART.tilt, BOX);
    const lean = 7 / Math.SQRT2;
    expect(tilt.move[0].tiltX).toBeCloseTo(lean);
    expect(tilt.move[0].tiltY).toBeCloseTo(lean);
    expect(tilt.move[1].tiltX).toBeCloseTo(-lean);
    expect(tilt.move[1].tiltY).toBeCloseTo(lean);
    /* A quarter of the way round, the lean has crossed to the other side. */
    expect(poseAt(tilt, LINEAR, 0.125).tiltX).toBeCloseTo(0);
  });
});

describe("a pose, read off the clock", () => {
  it("is rest before the clock starts, as fill-mode none shows a delay", () => {
    const ripple = resolveTrack(MOTION_ART.ripple, BOX);
    expect(poseAt(ripple, LINEAR, -0.3)).toEqual(REST);
    expect(poseAt(ripple, LINEAR, 0)).toMatchObject({ opacity: 0.7, scale: 0.3 });
  });

  it("eases each interval, not the whole cycle", () => {
    /* The sheen holds until 55%, crosses by 85%, holds to the end. */
    const sheen = resolveTrack(MOTION_ART.sheen, BOX);
    const curve = curveOf("ease-in-out", null);
    expect(poseAt(sheen, curve, 0.3).tx).toBeCloseTo(-1.3 * BOX.w);
    expect(poseAt(sheen, curve, 0.7).tx).toBeCloseTo(0.5 * BOX.w, 1);
    expect(poseAt(sheen, curve, 0.95).tx).toBeCloseTo(2.3 * BOX.w);
    /* And a stepped glitch holds each stop until the next. */
    const glitch = resolveTrack(MOTION_ART.glitch, BOX);
    const steps = curveOf("steps", 1);
    expect(poseAt(glitch, steps, 0.89).tx).toBe(-3);
    expect(poseAt(glitch, steps, 0.91).tx).toBe(3);
  });

  it("lights the lightning for the flash's own window", () => {
    const flash = resolveTrack(MOTION_ART.flash, BOX);
    const steps = curveOf("steps", 1);
    expect(poseAt(flash, steps, 0.5).opacity).toBe(0);
    expect(poseAt(flash, steps, 0.9).opacity).toBe(0.85);
    expect(poseAt(flash, steps, 0.95).opacity).toBe(0);
  });
});

describe("which timings are tracks", () => {
  it("names a track for a keyframe that moves a thing, none for paint", () => {
    const timing = (kind: string) => ({
      kind,
      seconds: 1,
      alternate: false,
      easing: "linear",
      steps: null,
      delaySeconds: 0,
    });
    expect(trackFor(timing("sheen"))).toBe(MOTION_ART.sheen);
    expect(trackFor(timing("flicker"))).toBe(MOTION_ART.flicker);
    for (const paint of ["pan", "pan-y", "rise", "fall", "drift", "wander", "hue"]) {
      expect(trackFor(timing(paint)), paint).toBeNull();
    }
    expect(trackFor(null)).toBeNull();
  });

  it("says whether a track fades, so its opacity replaces the stack's", () => {
    expect(fades(MOTION_ART.twinkle)).toBe(true);
    expect(fades(MOTION_ART.flash)).toBe(true);
    expect(fades(MOTION_ART.float)).toBe(false);
    expect(fades(MOTION_ART.spin)).toBe(false);
    expect(fades(null)).toBe(false);
  });
});
