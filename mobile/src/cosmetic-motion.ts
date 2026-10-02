import { useEffect, useMemo } from "react";
import {
  Easing,
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type DerivedValue,
  type SharedValue,
} from "react-native-reanimated";

import type { BorderMotion, MotionStop, Timing } from "./cosmetic-art-data";
import {
  curveOf,
  easingOf,
  poseAt,
  resolveTrack,
  trackFor,
  type Box,
  type Pose,
  type Resolved,
} from "./cosmetic-keyframes";

export * from "./cosmetic-keyframes";

/**
 * The website's keyframes, played on a phone.
 *
 * One Reanimated clock per animated thing, 0 to 1 over the timing's
 * period, and a derived `Pose` read off it on the UI thread each
 * frame by the arithmetic in `cosmetic-keyframes.ts`. Nothing here
 * draws; the paint renderer and the card ask for a pose and apply it.
 * No timers: a clock is a `withRepeat`, cancelled when its thing
 * leaves the screen.
 */

/**
 * One clock, 0 to 1 over the timing's period, forever.
 *
 * Linear, so the easing can be applied per interval by whoever reads
 * it. A delay runs the clock up from below zero first, and a reader
 * treats a negative clock as "not started": the thing sits at rest,
 * which is what `animation-fill-mode: none` shows during a delay.
 * `alternate` ping-pongs the repeat. Null is a clock that never moves.
 */
export function useClock(timing: Timing | BorderMotion | null): SharedValue<number> {
  const clock = useSharedValue(0);

  /* Keyed on the numbers, not the object: a timing built in render is
     a new object every time, and restarting the clock on each one
     would be a card that stutters whenever its screen re-renders. */
  const active = timing !== null && timing.seconds > 0;
  const seconds = timing?.seconds ?? 0;
  const alternate = timing?.alternate ?? false;
  const delay = timing && "delaySeconds" in timing ? timing.delaySeconds : 0;

  useEffect(() => {
    if (!active) {
      clock.value = 0;
      return;
    }

    const cycle = withRepeat(
      withTiming(1, { duration: seconds * 1000, easing: Easing.linear }),
      -1,
      alternate,
    );

    if (delay > 0) {
      clock.value = -delay / seconds;
      clock.value = withSequence(
        withTiming(0, { duration: delay * 1000, easing: Easing.linear }),
        cycle,
      );
    } else {
      clock.value = 0;
      clock.value = cycle;
    }

    return () => cancelAnimation(clock);
  }, [active, seconds, alternate, delay, clock]);

  return clock;
}

const STILL: Resolved = { fade: [], move: [] };

/**
 * The pose a track gives a thing of `box` size, read off a clock.
 *
 * The clock is the caller's, so a paint stack that already runs one
 * for its sliding layers reads its group's fade off the same clock
 * rather than a second one a frame out of step. A null track is rest.
 */
export function usePose(
  clock: SharedValue<number>,
  timing: Timing | BorderMotion | null,
  track: MotionStop[] | null,
  box: Box,
): DerivedValue<Pose> {
  const { easing, steps } = easingOf(timing);
  const curve = useMemo(() => curveOf(easing, steps), [easing, steps]);
  const { w, h } = box;
  const resolved = useMemo(
    () => (track ? resolveTrack(track, { w, h }) : STILL),
    [track, w, h],
  );

  return useDerivedValue(() => poseAt(resolved, curve, clock.value));
}

/**
 * A track, played: the pose of a thing of `box` size each frame.
 *
 * One clock per animated thing. With no timing, or a timing that
 * names a paint motion rather than a track, the pose is rest and the
 * clock still runs for whoever wants it.
 */
export function useTrack(
  timing: Timing | BorderMotion | null,
  box: Box,
): {
  clock: SharedValue<number>;
  pose: DerivedValue<Pose>;
  track: MotionStop[] | null;
} {
  const clock = useClock(timing);
  const track = trackFor(timing);
  const pose = usePose(clock, timing, track, box);

  return { clock, pose, track };
}
