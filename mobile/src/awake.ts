import { NavigationContext } from "@react-navigation/native";
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { AppState } from "react-native";
import {
  Easing,
  cancelAnimation,
  runOnUI,
  withRepeat,
  withTiming,
  type EasingFunction,
  type SharedValue,
} from "react-native-reanimated";

/**
 * Whether anybody can see what this component draws.
 *
 * A holo card, a worn ring and an aura each run a loop that never ends,
 * and a tab screen stays mounted behind whichever tab is in front, as
 * does every screen under the one on top of the stack. So a Feed of
 * foils kept turning under a profile, and a roster of rings kept
 * spinning under the Feed: frames drawn for nobody, on the thread that
 * also has to follow a thumb.
 *
 * Awake is: the screen this sits in is the one in front, and the app is
 * not in the background. Outside any screen (the first-run intro, a
 * bar the navigator draws) there is nothing to ask, and the answer is
 * the app's alone, so nothing that draws there is ever stopped by
 * mistake.
 *
 * "inactive" is still awake: that is the app switcher, Control Centre
 * and a system dialog, with the app in view behind them.
 */

let appAwake = AppState.currentState !== "background";
const appListeners = new Set<() => void>();
let watchingApp = false;

function subscribeApp(listener: () => void): () => void {
  if (!watchingApp) {
    /* One listener for the app's life, however many loops there are. */
    watchingApp = true;
    AppState.addEventListener("change", (next) => {
      const awake = next !== "background";
      if (awake === appAwake) return;
      appAwake = awake;
      for (const each of appListeners) each();
    });
  }
  appListeners.add(listener);
  return () => {
    appListeners.delete(listener);
  };
}

const appSnapshot = () => appAwake;

export function useAwake(): boolean {
  /* Read from the context, not through useIsFocused: that hook throws
     where there is no navigator, and a card is drawn in such places. */
  const navigation = useContext(NavigationContext);
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!navigation) return () => {};
      const offFocus = navigation.addListener("focus", listener);
      const offBlur = navigation.addListener("blur", listener);
      return () => {
        offFocus();
        offBlur();
      };
    },
    [navigation],
  );
  const focusSnapshot = useCallback(
    () => (navigation ? navigation.isFocused() : true),
    [navigation],
  );
  const focused = useSyncExternalStore(subscribe, focusSnapshot, focusSnapshot);
  const app = useSyncExternalStore(subscribeApp, appSnapshot, appSnapshot);
  return focused && app;
}

/**
 * `phase` going 0 to 1 forever while `awake`, and holding still where
 * it is while not.
 *
 * The first run is the loop these components always started: from 0,
 * `duration` long, there and back again when `bounce`. A return from a
 * pause carries on from where the value stopped, on the UI thread, and
 * falls into the same loop at the end of that lap, so nothing jumps
 * when a screen comes back into view. A null duration is no loop.
 */
export function useLoop(
  phase: SharedValue<number>,
  awake: boolean,
  duration: number | null,
  /* Ease in and out over each lap; linear otherwise. A flag rather
     than the easing itself, which would be a new function, and so a
     restarted loop, on every render. */
  easeInOut = false,
  bounce = false,
): void {
  /* Set while paused, so only a return from a pause resumes; a changed
     duration starts over from 0, as it always did. */
  const slept = useRef(false);

  useEffect(() => {
    if (duration === null) return;
    if (!awake) {
      slept.current = true;
      return;
    }
    const resume = slept.current;
    slept.current = false;
    const linear: EasingFunction = Easing.linear;
    const easing: EasingFunction = easeInOut ? Easing.inOut(Easing.ease) : linear;

    if (!resume) {
      phase.value = 0;
      phase.value = withRepeat(withTiming(1, { duration, easing }), -1, bounce);
    } else {
      runOnUI(() => {
        "worklet";
        const at = phase.value;
        if (!(at > 0 && at < 1)) {
          phase.value = 0;
          phase.value = withRepeat(withTiming(1, { duration, easing }), -1, bounce);
          return;
        }
        /* The rest of this lap, at the lap's own pace. */
        phase.value = withTiming(
          1,
          { duration: duration * (1 - at), easing: linear },
          (finished) => {
            "worklet";
            if (!finished) return;
            if (bounce) {
              phase.value = withRepeat(withTiming(0, { duration, easing }), -1, true);
            } else {
              phase.value = 0;
              phase.value = withRepeat(withTiming(1, { duration, easing }), -1, false);
            }
          },
        );
      })();
    }

    /* Cancelled on the way out and on a pause: the value stays where
       it stopped, which is what a resume reads. */
    return () => cancelAnimation(phase);
  }, [awake, duration, easeInOut, bounce, phase]);
}
