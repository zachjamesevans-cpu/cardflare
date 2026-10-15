import * as Haptics from "expo-haptics";
import { useEffect, useRef, type ReactNode } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  runOnUI,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { ACTION_WIDTH, pastFullSwipe, swipeRelease } from "./swipe-release";
import { colors } from "./theme";
import { Tap } from "./ui";

/**
 * A row that swipes left to delete, the way iOS lists do.
 *
 * Two ways out, the founder's: "you can swipe normally and press it, or
 * swipe a lot more and it 'closes in on itself' and disappears." A short
 * swipe stops with the red Delete showing; a long one, past half the
 * row (swipe-release.ts), ticks once to say it is armed and deletes on
 * release. Either way the row slides off and folds shut BEFORE the
 * server hears about it: "it should delete immediately visually even
 * if it takes a second for the server to respond." `onDelete` runs once
 * the row is gone, and the list it lives in drops it at once.
 *
 * One Delete showing at a time. The founder: "tapping anywhere on the
 * screen removes that delete button visibility. currently, you can
 * swipe all of these cards slightly on the same screen, and a delete
 * button can be simultaneously viewed on all." Opening a row closes
 * the last one, and the screen calls `dismissSwipe` on every touch and
 * scroll; only a touch on the showing Delete itself leaves it be.
 */

/** The row showing its Delete, if any. */
let shown: {
  id: object;
  close: () => void;
  /** Whether a touch at these window coordinates is on its Delete. */
  onDelete: (pageX: number, pageY: number) => boolean;
} | null = null;

/**
 * Closes the Delete that is showing, unless the touch is on it. For a
 * screen's onTouchStart and onScrollBeginDrag; call with no point to
 * close it regardless.
 */
export function dismissSwipe(pageX?: number, pageY?: number): void {
  if (!shown) return;
  if (pageX !== undefined && pageY !== undefined && shown.onDelete(pageX, pageY)) return;
  const row = shown;
  shown = null;
  row.close();
}

/* A Delete opening: a little past, then back, so it lands like iOS's.
   Closing stays firm; a bounce on the way shut reads as a wobble. */
const OPEN = { damping: 12, stiffness: 190, mass: 0.9 };
const SHUT = { damping: 22, stiffness: 220 };

export function SwipeToDelete({
  label,
  enabled = true,
  onDelete,
  children,
}: {
  /** What is deleted, for VoiceOver: "Delete Nami". */
  label: string;
  enabled?: boolean;
  onDelete: () => void;
  children: ReactNode;
}) {
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const width = useSharedValue(0);
  /** The row's height, measured; folded to 0 on the way out. */
  const height = useSharedValue(-1);
  const armed = useSharedValue(false);
  const gone = useSharedValue(false);
  const deleted = useRef(false);
  const self = useRef({}).current;
  const box = useRef<View>(null);

  const closed = () => {
    if (shown?.id === self) shown = null;
  };
  const opened = () => {
    if (shown && shown.id !== self) dismissSwipe();
    box.current?.measureInWindow((left, top, rowWidth, rowHeight) => {
      shown = {
        id: self,
        close: () => {
          x.value = withSpring(0, SHUT);
        },
        onDelete: (pageX, pageY) =>
          pageY >= top &&
          pageY <= top + rowHeight &&
          pageX >= left + rowWidth - ACTION_WIDTH &&
          pageX <= left + rowWidth,
      };
    });
  };
  useEffect(() => closed, []);

  const finish = () => {
    closed();
    if (deleted.current) return;
    deleted.current = true;
    onDelete();
  };
  /* Past the line: a firm tick, it will delete. Back out of it: a light
     one, it will not. */
  const tick = (over: boolean) => {
    Haptics.impactAsync(
      over ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    ).catch(() => {});
  };

  /* Off to the left, then the gap closes: "closes in on itself". */
  const remove = () => {
    "worklet";
    if (gone.value) return;
    gone.value = true;
    x.value = withTiming(-Math.max(width.value, ACTION_WIDTH), { duration: 160 }, () => {
      height.value = withTiming(0, { duration: 180 }, (done) => {
        if (done) runOnJS(finish)();
      });
    });
  };

  const pan = Gesture.Pan()
    .enabled(enabled)
    /* Sideways only: an up-and-down drag is the list scrolling. */
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onBegin(() => {
      start.value = x.value;
    })
    .onUpdate((event) => {
      if (gone.value) return;
      const next = Math.min(0, start.value + event.translationX);
      x.value = next;
      const over = pastFullSwipe(next, width.value);
      if (over !== armed.value) {
        armed.value = over;
        runOnJS(tick)(over);
      }
    })
    .onEnd((event) => {
      if (gone.value) return;
      const outcome = swipeRelease(x.value, event.velocityX, width.value);
      armed.value = false;
      if (outcome === "delete") {
        remove();
        return;
      }
      if (outcome === "open") {
        x.value = withSpring(-ACTION_WIDTH, { ...OPEN, velocity: event.velocityX });
        runOnJS(opened)();
      } else {
        x.value = withSpring(0, SHUT);
        runOnJS(closed)();
      }
    });

  const measure = (event: LayoutChangeEvent) => {
    if (gone.value) return;
    width.value = event.nativeEvent.layout.width;
    height.value = event.nativeEvent.layout.height;
  };

  const fold = useAnimatedStyle(() =>
    gone.value && height.value >= 0 ? { height: height.value } : {},
  );
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  /* The red grows with the swipe, so a long one is red right across. */
  const red = useAnimatedStyle(() => ({ width: Math.max(0, -x.value) }));

  return (
    <Animated.View style={[styles.frame, fold]}>
      {/* Measured for where the Delete sits on screen (dismissSwipe). */}
      <View ref={box} collapsable={false} pointerEvents="none" style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.red, red]}>
        <Tap
          accessibilityLabel={`Delete ${label}`}
          onPress={() => runOnUI(remove)()}
          style={styles.action}
        >
          <Text style={styles.actionLabel} numberOfLines={1}>
            Delete
          </Text>
        </Tap>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={slide} onLayout={measure}>
          {children}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden" },
  red: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    overflow: "hidden",
    get backgroundColor() {
      return colors.destructive;
    },
  },
  /* Held at the content's edge, the way iOS keeps the word beside the
     row it deletes. */
  action: {
    width: ACTION_WIDTH,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
});
