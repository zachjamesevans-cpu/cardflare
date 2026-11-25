import { Ionicons } from "@expo/vector-icons";
import { Text, View, type ViewStyle } from "react-native";

import { colors, spacing } from "./theme";

/**
 * "Already on your Flares": a small cardflare-green rounded rectangle
 * saying "Flared", never a button. The founder (2026-11-25), of the round
 * flame that came first: "that little flare icon ... is awful ... maybe
 * just a small rounded rectangle instead." It pairs with the dark
 * printings badge on a search result (same height and rounding); on the
 * composer's small tiles it comes smaller.
 */
export function FlaredTag({ small = false, style }: { small?: boolean; style?: ViewStyle }) {
  return (
    <View
      pointerEvents="none"
      accessibilityLabel="On your Flares"
      style={[
        {
          height: small ? 14 : 20,
          paddingHorizontal: small ? 4 : 6,
          borderRadius: small ? 4 : 6,
          backgroundColor: colors.accent,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Text
        maxFontSizeMultiplier={1.2}
        style={{
          color: colors.accentContrast,
          fontSize: small ? 8 : 11,
          fontWeight: "800",
        }}
      >
        Flared
      </Text>
    </View>
  );
}

/** "On your Flares", the pill under a card's name on its sheet. */
export function FlaredPill() {
  return (
    <View
      accessibilityLabel="This art is on your Flares"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: spacing(2.5),
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: colors.accentTint,
      }}
    >
      <Ionicons name="flame" size={13} color={colors.accent} />
      <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "800" }}>
        On your Flares
      </Text>
    </View>
  );
}
