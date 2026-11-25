import { Ionicons } from "@expo/vector-icons";
import { Text, View, type ViewStyle } from "react-native";

import { colors, spacing } from "./theme";

/**
 * "Already on your Flares": a small green flame, never a button. On a
 * search result's art, on a tile in the composer's row (my-flares.ts).
 */
export function FlaredMark({ size = 20, style }: { size?: number; style?: ViewStyle }) {
  return (
    <View
      pointerEvents="none"
      accessibilityLabel="On your Flares"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.accent,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1.5,
          borderColor: colors.canvas,
        },
        style,
      ]}
    >
      <Ionicons name="flame" size={Math.round(size * 0.6)} color={colors.accentContrast} />
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
