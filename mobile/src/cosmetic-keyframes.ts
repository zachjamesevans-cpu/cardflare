import {
  MOTION_ART,
  type BorderMotion,
  type Len,
  type MotionStop,
  type Timing,
} from "./cosmetic-art-data";

/**
 * The website's keyframes, as arithmetic.
 *
 * A card animation or a profile scene is mostly a CSS `@keyframes`
 * rule: a few stops, each a transform and an opacity, eased between
 * and looped. `cosmetic-art-data.ts` carries every one of those rules
 * as a track of `MotionStop`s; this module resolves a track against
 * the thing it moves and reads the pose at any point of the cycle.
 * `cosmetic-motion.ts` wraps it in the Reanimated clock that supplies
 * the point; nothing here touches React or a native module, so
 * `tests/unit/app-cosmetic-motion.test.ts` can import it and check
 * the arithmetic against the stylesheet's intent.
 *
 * The semantics are CSS's own, because a shelf full of cards that
 * ripple a beat differently from the website is two products with one
 * name:
 *
 * - `animation-timing-function` eases EACH interval between two stops,
 *   not the whole cycle, so a `steps(1)` glitch holds each stop until
 *   the next and an `ease-out` ripple decelerates between every pair.
 * - A stop that names no transform is not a transform keyframe at all
 *   (it is interpolated across), and the opacity channel is its own
 *   property: the shockwave's ring keeps growing through the stop that
 *   only dims it. Missing 0% and 100% keyframes are the thing at rest.
 * - Before the clock starts (a negative clock, during a delay) the
 *   thing is at rest, as `animation-fill-mode: none` shows it.
 *
 * The functions that run per frame carry a `"worklet"` directive so
 * Reanimated can call them on the UI thread.
 */

/** A box the percentage lengths of a track resolve against. */
export interface Box {
  w: number;
  h: number;
}

/** What a thing looks like at one instant: its transform and opacity, resolved. */
export interface Pose {
  opacity: number;
  /** Points. */
  tx: number;
  ty: number;
  scale: number;
  /** Degrees, clockwise. */
  rotate: number;
  /** Degrees. */
  skewX: number;
  /** CSS `rotate3d(x, y, 0, deg)`, decomposed to degrees about each axis. */
  tiltX: number;
  tiltY: number;
}

/** A thing at rest: the pose a track starts from and returns to. */
export const REST: Pose = {
  opacity: 1,
  tx: 0,
  ty: 0,
  scale: 1,
  rotate: 0,
  skewX: 0,
  tiltX: 0,
  tiltY: 0,
};

/** How far a card leans into a `tilt`: CSS's `perspective` on the shelf. */
export const TILT_PERSPECTIVE = 600;

/** The paint motions the stack renderer plays by kind; everything else is a track. */
export const PAINT_KINDS = new Set([
  "pan",
  "pan-y",
  "rise",
  "fall",
  "drift",
  "wander",
  "hue",
]);

/**
 * An easing, as numbers a worklet can read.
 *
 * `shape` 0 is linear, 1 a cubic bezier through the two control
 * points, 2 CSS `steps(n)` (jump at each interval's end, as the
 * stylesheet's unqualified `steps(1)` and `steps(14)` mean).
 */
export interface Curve {
  shape: 0 | 1 | 2;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  steps: number;
}

export const LINEAR: Curve = { shape: 0, x1: 0, y1: 0, x2: 1, y2: 1, steps: 1 };

/** CSS's named timing functions, by their control points. */
const BEZIERS: Record<string, [number, number, number, number]> = {
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};

/** The curve an easing names. */
export function curveOf(easing: string, steps: number | null): Curve {
  if (easing === "steps") {
    return { ...LINEAR, shape: 2, steps: Math.max(1, steps ?? 1) };
  }
  const bezier = BEZIERS[easing];
  if (!bezier) return LINEAR;
  return {
    shape: 1,
    x1: bezier[0],
    y1: bezier[1],
    x2: bezier[2],
    y2: bezier[3],
    steps: 1,
  };
}

/** A timing's easing and step count; a border motion has neither and is linear. */
export function easingOf(timing: Timing | BorderMotion | null): {
  easing: string;
  steps: number | null;
} {
  if (!timing || !("easing" in timing)) return { easing: "linear", steps: null };
  return { easing: timing.easing, steps: timing.steps };
}

/** The curve a timing names. */
export function curveFor(timing: Timing | BorderMotion | null): Curve {
  const { easing, steps } = easingOf(timing);
  return curveOf(easing, steps);
}

/** One coordinate of a cubic bezier whose ends are pinned at 0 and 1. */
function bezierAxis(t: number, a: number, b: number): number {
  "worklet";
  const u = 1 - t;
  return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
}

/**
 * The curve at `p`, 0 to 1.
 *
 * The bezier is solved for t by Newton's method off the x axis, as
 * the browsers do it; eight rounds are plenty for a 7 degree lean.
 */
export function ease(curve: Curve, p: number): number {
  "worklet";
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  if (curve.shape === 2) return Math.floor(p * curve.steps) / curve.steps;
  if (curve.shape === 0) return p;

  let t = p;
  for (let round = 0; round < 8; round += 1) {
    const x = bezierAxis(t, curve.x1, curve.x2) - p;
    const u = 1 - t;
    const slope =
      3 * u * u * curve.x1 +
      6 * u * t * (curve.x2 - curve.x1) +
      3 * t * t * (1 - curve.x2);
    if (Math.abs(x) < 1e-5 || slope === 0) break;
    t -= x / slope;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  return bezierAxis(t, curve.y1, curve.y2);
}

/** A keyframe of the opacity channel. */
interface FadeKey {
  at: number;
  value: number;
}

/** A keyframe of the transform channel, every function resolved. */
interface MoveKey {
  at: number;
  tx: number;
  ty: number;
  scale: number;
  rotate: number;
  skewX: number;
  tiltX: number;
  tiltY: number;
}

/** A track resolved against its box, as the two CSS properties it animates. */
export interface Resolved {
  fade: FadeKey[];
  move: MoveKey[];
}

function length(value: Len | undefined, whole: number): number {
  if (!value || value === "auto") return 0;
  return "px" in value ? value.px : value.frac * whole;
}

function moves(stop: MotionStop): boolean {
  return (
    stop.tx !== undefined ||
    stop.ty !== undefined ||
    stop.scale !== undefined ||
    stop.rotate !== undefined ||
    stop.skewX !== undefined ||
    stop.tilt !== undefined
  );
}

/**
 * The track's stops as keyframes, with percent lengths resolved
 * against `box` and `rotate3d` split into its two leans.
 *
 * A stop that names only an opacity is no transform keyframe, and
 * one that names only a transform is no opacity keyframe: each
 * channel interpolates across the stops that do not mention it, as a
 * browser does. A channel nobody mentions is empty and reads as rest.
 */
export function resolveTrack(track: MotionStop[], box: Box): Resolved {
  const fade: FadeKey[] = [];
  const move: MoveKey[] = [];

  for (const stop of track) {
    if (stop.opacity !== undefined) fade.push({ at: stop.at, value: stop.opacity });
    if (moves(stop)) {
      let tiltX = 0;
      let tiltY = 0;
      if (stop.tilt) {
        const norm = Math.hypot(stop.tilt.x, stop.tilt.y) || 1;
        tiltX = (stop.tilt.deg * stop.tilt.x) / norm;
        tiltY = (stop.tilt.deg * stop.tilt.y) / norm;
      }
      move.push({
        at: stop.at,
        tx: length(stop.tx, box.w),
        ty: length(stop.ty, box.h),
        scale: stop.scale ?? 1,
        rotate: stop.rotate ?? 0,
        skewX: stop.skewX ?? 0,
        tiltX,
        tiltY,
      });
    }
  }

  /* The keyframes a stylesheet leaves out are the thing at rest. */
  if (fade.length > 0) {
    if (fade[0].at > 0) fade.unshift({ at: 0, value: 1 });
    if (fade[fade.length - 1].at < 1) fade.push({ at: 1, value: 1 });
  }
  if (move.length > 0) {
    const rest = { tx: 0, ty: 0, scale: 1, rotate: 0, skewX: 0, tiltX: 0, tiltY: 0 };
    if (move[0].at > 0) move.unshift({ at: 0, ...rest });
    if (move[move.length - 1].at < 1) move.push({ at: 1, ...rest });
  }

  return { fade, move };
}

/** Where `t` falls between two keyframes, and how far along, eased. */
function segment(
  keys: { at: number }[],
  t: number,
  curve: Curve,
): { from: number; to: number; p: number } {
  "worklet";
  let from = 0;
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (t >= keys[i].at) from = i;
  }
  const to = Math.min(keys.length - 1, from + 1);
  const span = keys[to].at - keys[from].at;
  const p = span > 0 ? ease(curve, (t - keys[from].at) / span) : 1;
  return { from, to, p };
}

/** The pose at `t` of a cycle, 0 to 1. Before 0 the thing is at rest. */
export function poseAt(resolved: Resolved, curve: Curve, t: number): Pose {
  "worklet";
  const pose = {
    opacity: 1,
    tx: 0,
    ty: 0,
    scale: 1,
    rotate: 0,
    skewX: 0,
    tiltX: 0,
    tiltY: 0,
  };
  if (t < 0) return pose;
  const at = Math.min(1, t);

  const { fade, move } = resolved;
  if (fade.length > 0) {
    const { from, to, p } = segment(fade, at, curve);
    pose.opacity = fade[from].value + (fade[to].value - fade[from].value) * p;
  }
  if (move.length > 0) {
    const { from, to, p } = segment(move, at, curve);
    const a = move[from];
    const b = move[to];
    pose.tx = a.tx + (b.tx - a.tx) * p;
    pose.ty = a.ty + (b.ty - a.ty) * p;
    pose.scale = a.scale + (b.scale - a.scale) * p;
    pose.rotate = a.rotate + (b.rotate - a.rotate) * p;
    pose.skewX = a.skewX + (b.skewX - a.skewX) * p;
    pose.tiltX = a.tiltX + (b.tiltX - a.tiltX) * p;
    pose.tiltY = a.tiltY + (b.tiltY - a.tiltY) * p;
  }
  return pose;
}

/** The track a timing names, or null for a paint motion and for a name nobody drew. */
export function trackFor(timing: Timing | BorderMotion | null): MotionStop[] | null {
  if (!timing || PAINT_KINDS.has(timing.kind)) return null;
  return MOTION_ART[timing.kind] ?? null;
}

/** Whether a track fades: whoever applies it should take its opacity over their own. */
export function fades(track: MotionStop[] | null): boolean {
  return Boolean(track && track.some((stop) => stop.opacity !== undefined));
}
