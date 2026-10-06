import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

/**
 * How a full-height sheet lets go, written once for every sheet.
 *
 * The founder: back is a swipe from the LEFT EDGE everywhere, sheets
 * included, and not a whole-screen swipe (he asked for the edge only,
 * earlier, after a drag in the middle of a card rail kept popping the
 * screen). So a sheet closes three ways besides its X:
 *
 * - a drag that starts in the strip down its left edge and goes right;
 * - a pull down that starts in the strip across its top (the title
 *   row), the way every phone sheet goes away;
 * - and dragging its list puts the keyboard away, which is each sheet's
 *   own `keyboardDismissMode="on-drag"`.
 *
 * The sheet follows the finger while it is dragged and springs back if
 * the drag was short and slow, so a nudge never closes anything.
 *
 * Each gesture can only START in its strip (`hitSlop` with a width or a
 * height is react-native-gesture-handler's edge area), so a horizontal
 * rail or a vertical list in the middle of the sheet is never a close.
 */

/** The left-edge strip a close can start in, in points. */
export const SHEET_EDGE = 24;

/** The top strip a pull-down can start in, in points: the title row. */
export const SHEET_PULL_ZONE = 64;

/** A drag this far closes, however slowly. */
export const SHEET_CLOSE_DISTANCE = 80;

/** A flick this fast closes, once it has moved a little. */
export const SHEET_CLOSE_VELOCITY = 800;

/** Whether a drag that let go here closes the sheet. */
export function shouldCloseSheet(distance: number, velocity: number): boolean {
  "worklet";
  if (distance >= SHEET_CLOSE_DISTANCE) return true;
  return distance > 16 && velocity >= SHEET_CLOSE_VELOCITY;
}

/**
 * The sheet's panel. Takes the panel's own style, and claims every tap
 * that lands on it (what the inner `Pressable onPress={() => undefined}`
 * used to do), so a tap on the panel never reaches the backdrop's close.
 *
 * It brings its own GestureHandlerRootView. Android draws a Modal in a
 * window of its own, outside the app's root, and no gesture inside it
 * fires without one; on iOS it is a plain View. It fills whatever holds
 * the panel and stands the panel at its foot, which is where a bottom
 * sheet already sat (its backdrop Pressable is `justifyContent:
 * "flex-end"`) and changes nothing for a full-screen one (flex 1). A
 * tap on it, off the panel, still reaches the backdrop's close, because
 * a plain View never claims a touch.
 */
export function SwipeToClose({
  onClose,
  style,
  pullZone = SHEET_PULL_ZONE,
  children,
}: {
  onClose: () => void;
  style?: StyleProp<ViewStyle>;
  /** How tall the pull-down strip is: a full-screen sheet adds the status bar. */
  pullZone?: number;
  children: ReactNode;
}) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);

  const edge = Gesture.Pan()
    .hitSlop({ left: 0, width: SHEET_EDGE })
    .activeOffsetX(10)
    .failOffsetY([-20, 20])
    .onUpdate((event) => {
      x.value = Math.max(0, event.translationX);
    })
    .onEnd((event) => {
      if (shouldCloseSheet(event.translationX, event.velocityX)) {
        runOnJS(onClose)();
      } else {
        x.value = withSpring(0);
      }
    });

  const pull = Gesture.Pan()
    .hitSlop({ top: 0, height: pullZone })
    .activeOffsetY(10)
    .failOffsetX([-20, 20])
    .onUpdate((event) => {
      y.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (shouldCloseSheet(event.translationY, event.velocityY)) {
        runOnJS(onClose)();
      } else {
        y.value = withSpring(0);
      }
    });

  const follow = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  return (
    <GestureHandlerRootView style={{ flex: 1, justifyContent: "flex-end" }}>
      <GestureDetector gesture={Gesture.Race(edge, pull)}>
        <Animated.View style={[style, follow]} onStartShouldSetResponder={() => true}>
          {children}
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}
