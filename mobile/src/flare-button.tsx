import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, type Ref } from "react";
import { Text, View, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useSpotlightTarget } from "./spotlight";
import { Tap } from "./ui";
import { colors } from "./theme";

/** The button's diameter, in points. */
export const FLARE_BUTTON = 58;

/**
 * THE FLARE BUTTON: one cardflare-green "+ flame", always in the same
 * corner, and always "post a Flare" - for whatever is on screen. The
 * founder (2026-11-25): "maybe we can have a persistent cardflare green
 * '+ flame icon' everywhere on the app. its contextual." On a card it
 * flares that card; on a hunt, for that hunt; anywhere else it opens the
 * composer. It replaced the Feed's + and a card's "Post a Flare for it",
 * so posting has one door. The website draws the same (src/components/flares/flare-button.tsx).
 * A room's Flare button is this one too (flare-fab.tsx).
 *
 * The label says what THIS tap will do ("Flare Perona"), for VoiceOver,
 * because the glyph cannot. It is also what the new-player spotlight
 * rings (spotlight.tsx), the way it rang the Feed's +.
 */
export function FlareButton({
  label,
  onPress,
  style,
  spotlight = false,
  outerRef,
  done = false,
  count = 0,
  copies,
}: {
  label: string;
  onPress: () => void;
  style?: ViewStyle;
  /** Ring this one in the first-run spotlight (only the tab bar's). */
  spotlight?: boolean;
  /** For a tour that measures the button (the room's). */
  outerRef?: Ref<View>;
  /** This card's art is in your Flare already: a ✓, and a tap views it. */
  done?: boolean;
  /** Cards in your Flare so far, the cart's count (flare-cart.ts). */
  count?: number;
  /** On a card: copies of the art on show in your Flare, worn as "×4"
   * in place of the cart's count. */
  copies?: number;
}) {
  const tally = copies ?? count;
  const target = useSpotlightTarget();

  /* A card landing in the cart: the button pops and the count bounces,
     once, so the add is felt. The founder (2026-11-27) chose it. Only
     on a rise: opening the app with 3 waiting stays still. */
  const pop = useSharedValue(1);
  const bump = useSharedValue(1);
  const reduced = useReducedMotion();
  const last = useRef({ tally, done });
  useEffect(() => {
    /* A rise in the count (the tab bar's), in a card's copies (each
       tap of a card's +), or a ✓ landing. */
    const rose = tally > last.current.tally;
    const landed = done && !last.current.done;
    last.current = { tally, done };
    if ((!rose && !landed) || reduced) return;
    pop.value = withSequence(
      withTiming(1.12, { duration: 110 }),
      withSpring(1, { damping: 9, stiffness: 260 }),
    );
    if (rose)
      bump.value = withSequence(
        withTiming(1.35, { duration: 120 }),
        withSpring(1, { damping: 8, stiffness: 280 }),
      );
  }, [tally, done, reduced, pop, bump]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));

  return (
    <View
      ref={spotlight ? target : outerRef}
      collapsable={false}
      pointerEvents="box-none"
      style={[{ position: "absolute" }, style]}
    >
      <Animated.View style={popStyle}>
      <Tap
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          width: FLARE_BUTTON,
          height: FLARE_BUTTON,
          borderRadius: FLARE_BUTTON / 2,
          backgroundColor: colors.accent,
          alignItems: "center",
          justifyContent: "center",
          /* A tight glow that keeps the edge crisp, not a wide haze
             over the cards under it (the founder, 2026-11-27). */
          shadowColor: colors.accent,
          shadowOpacity: 0.4,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 6,
        }}
      >
        {/* One bold +, nothing else: the founder (2026-11-25), of the
            flame with a + disc on its shoulder, "still so ugly", then
            this. The compose button everyone already reads. */}
        <Ionicons
          name={done ? "checkmark" : "add"}
          size={done ? 30 : 34}
          color={colors.accentContrast}
        />
      </Tap>
      </Animated.View>
      {/* The cart's count, the way a shopping bag wears one; on a card,
          this art's copies ("×4"). */}
      {tally > 0 ? (
        <Animated.View
          pointerEvents="none"
          accessibilityLabel={
            copies !== undefined ? `${copies} in your Flare` : `${count} in your Flare`
          }
          style={[bumpStyle, {
            position: "absolute",
            top: -3,
            right: -3,
            minWidth: 22,
            height: 22,
            borderRadius: 11,
            paddingHorizontal: 5,
            backgroundColor: colors.canvas,
            borderWidth: 2,
            borderColor: colors.accent,
            alignItems: "center",
            justifyContent: "center",
          }]}
        >
          <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "800" }}>
            {copies !== undefined ? `×${copies}` : count > 99 ? "99+" : count}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

