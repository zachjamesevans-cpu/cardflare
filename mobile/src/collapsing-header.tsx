import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BRAND_FONT, useBrandFont } from "./brand-font";
import { colors, spacing } from "./theme";
import { Tap } from "./ui";

/**
 * A header that gets out of the way, the way Instagram's does.
 *
 * The founder: "the 'card flare' text at top doesn't need to be glued
 * to the top ... the goal is to have maximized viewing space, when
 * there's no need to have the header always showing."
 *
 * Four behaviours, and the third is the one people actually notice:
 *
 * 1. IT OVERLAYS, it does not sit above. The list runs underneath a
 *    translucent blur, so the pixels behind the bar are content rather
 *    than a strip of empty chrome. That is where the space comes from.
 * 2. Scrolling DOWN pushes it off the top, a pixel of header per pixel
 *    of scroll, so it leaves at the speed the thumb asks for.
 * 3. Scrolling UP brings it straight back — from anywhere in the list,
 *    not only from the top. This is the part that makes it feel like a
 *    surface rather than a rule: the header belongs to the gesture, not
 *    to the scroll position.
 * 4. At the top of the list it is always fully there.
 *
 * All of it runs on the UI thread through Reanimated. A header driven
 * from JavaScript stutters against the very scroll it is following,
 * which reads as cheaper than no animation at all.
 */
export const HEADER_CONTENT_HEIGHT = 52;

export interface HeaderScroll {
  /** How far the bar is currently pushed up, 0…HEADER_CONTENT_HEIGHT. */
  hidden: SharedValue<number>;
  /** The last scroll offset, kept so a delta can be worked out. */
  lastY: SharedValue<number>;
}

/** The two values the screen owns and hands to both halves. */
export function useHeaderScroll(): HeaderScroll {
  return {
    hidden: useSharedValue(0),
    lastY: useSharedValue(0),
  };
}

/**
 * What the ScrollView does on every frame of scroll.
 *
 * Deliberately a plain worklet body rather than a hook so the screen
 * can compose it with whatever else it needs to do on scroll.
 */
export function onHeaderScroll(state: HeaderScroll, y: number): void {
  "worklet";

  /* At the top, and past it on a rubber-band bounce, the header is
     always whole. Anything else means a pull-to-refresh reveals a
     half-eaten bar. */
  if (y <= 0) {
    state.hidden.value = 0;
    state.lastY.value = y;
    return;
  }

  const delta = y - state.lastY.value;
  const next = state.hidden.value + delta;

  state.hidden.value = Math.min(Math.max(next, 0), HEADER_CONTENT_HEIGHT);
  state.lastY.value = y;
}

/**
 * Snap on release, so the bar is never left half-eaten.
 *
 * A header stopped at forty percent is the one state that looks like a
 * bug rather than a behaviour. Whichever way it is leaning when the
 * thumb lifts, it finishes the journey.
 */
export function settleHeader(state: HeaderScroll): void {
  "worklet";

  const half = HEADER_CONTENT_HEIGHT / 2;
  if (state.hidden.value <= 0 || state.hidden.value >= HEADER_CONTENT_HEIGHT) return;

  state.hidden.value = withTiming(
    state.hidden.value > half ? HEADER_CONTENT_HEIGHT : 0,
    { duration: 160 },
  );
}

export function CollapsingHeader({
  state,
  onSearch,
}: {
  state: HeaderScroll;
  onSearch: () => void;
}) {
  const insets = useSafeAreaInsets();
  const loaded = useBrandFont();

  const bar = useAnimatedStyle(() => ({
    transform: [{ translateY: -state.hidden.value }],
    /*
     * Fades as it leaves. Sliding alone leaves the wordmark legible
     * while it is halfway under the status bar, which reads as the
     * text escaping rather than the bar retiring.
     */
    opacity: interpolate(state.hidden.value, [0, HEADER_CONTENT_HEIGHT], [1, 0]),
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
        },
        bar,
      ]}
      /* The bar moves, but only its controls should take a touch — a
         full-width overlay would eat taps meant for the card beneath
         the moment it starts to slide away. */
      pointerEvents="box-none"
    >
      <BlurView
        intensity={40}
        tint="dark"
        style={{
          /*
           * The blur covers the status bar too, and the inset is padding
           * INSIDE it rather than margin above it.
           *
           * With the inset on the wrapper the bar started below the
           * notch and left the status-bar strip untreated, so card text
           * scrolled raw behind the clock while the header was showing —
           * legible enough to read and messy enough to notice. Now the
           * frosted surface runs to the very top, and when the header
           * leaves it all leaves together.
           */
          paddingTop: insets.top,
          height: insets.top + HEADER_CONTENT_HEIGHT,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          /* A hairline, because a blur over a dark feed can be almost
             invisible where the content behind it happens to be black. */
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Text
          style={{
            color: colors.textPrimary,
            fontSize: 20,
            fontFamily: loaded ? BRAND_FONT : undefined,
            fontWeight: loaded ? "normal" : "700",
            letterSpacing: loaded ? 0.5 : 0,
          }}
        >
          cardflare
        </Text>

        {/*
          * The positioning lives on this wrapper, NOT on the Tap.
          *
          * Tap puts its `style` on an inner Animated.View rather than on
          * the Pressable, so `position: absolute` there takes the icon
          * out of its own button's flow: the Pressable collapses to
          * nothing, stays in the row beside the title, and the glyph
          * lands under the wordmark instead of right of it. Which is
          * exactly what it did.
          */}
        <View
          style={{
            position: "absolute",
            right: 0,
            /* Below the inset, so the glyph lines up with the wordmark
               rather than centring against the notch as well. */
            top: insets.top,
            bottom: 0,
            justifyContent: "center",
          }}
        >
          <Tap
            accessibilityLabel="Find a player"
            onPress={onSearch}
            style={{
              paddingLeft: spacing(4),
              paddingRight: spacing(4),
              paddingVertical: spacing(2),
            }}
          >
            <Ionicons name="search" size={20} color={colors.textSecondary} />
          </Tap>
        </View>
      </BlurView>
    </Animated.View>
  );
}
