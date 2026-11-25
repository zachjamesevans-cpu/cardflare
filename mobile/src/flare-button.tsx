import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { Ref } from "react";
import { Text, View, type ViewStyle } from "react-native";

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
}) {
  const target = useSpotlightTarget();
  return (
    <View
      ref={spotlight ? target : outerRef}
      collapsable={false}
      pointerEvents="box-none"
      style={[{ position: "absolute" }, style]}
    >
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
          shadowColor: colors.accent,
          shadowOpacity: 0.45,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 4 },
          elevation: 8,
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
      {/* The cart's count, the way a shopping bag wears one. */}
      {count > 0 ? (
        <View
          pointerEvents="none"
          accessibilityLabel={`${count} in your Flare`}
          style={{
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
          }}
        >
          <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "800" }}>
            {count > 99 ? "99+" : count}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
