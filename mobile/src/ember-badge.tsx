import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { colors, spacing } from "./theme";

/**
 * A player's lifetime Embers, wherever their name appears — the
 * website's EmberBadge, same pill, same two sizes, same rule: there is
 * no prop for the spendable balance, so this component can never
 * accidentally publish what somebody has left.
 *
 * The number and the word "Embers", nothing else. One currency, one
 * word — the founder's correction, kept on both platforms.
 */
export function EmberBadge({ earned, size = "sm" }: { earned: number; size?: "sm" | "md" }) {
  const sm = size === "sm";

  return (
    <View
      accessibilityLabel={`${earned.toLocaleString()} Embers earned`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: spacing(1),
        borderRadius: 999,
        borderWidth: 1,
        /* accent at 25% / 10%, matching border-accent/25 bg-accent/10. */
        borderColor: "rgba(198, 238, 79, 0.25)",
        backgroundColor: "rgba(198, 238, 79, 0.1)",
        paddingHorizontal: sm ? spacing(2) : spacing(3),
        paddingVertical: sm ? spacing(0.5) : spacing(1),
      }}
    >
      <Ionicons name="flame" size={sm ? 11 : 15} color={colors.accent} />
      <Text
        style={{
          color: colors.accent,
          fontSize: sm ? 11 : 14,
          fontWeight: "600",
          fontVariant: ["tabular-nums"],
        }}
      >
        {earned.toLocaleString()}
      </Text>
    </View>
  );
}
