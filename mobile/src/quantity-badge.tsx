import type { StyleProp, ViewStyle } from "react-native";
import { Text, View } from "react-native";

import { colors } from "./theme";

/**
 * How many copies, as one small black and white tag: "×2".
 *
 * The founder, on the binder's pocket tag: "I like how there's the small
 * black quantity amount in the binder too, the Shanks has 2x but it's a
 * lowkey black and white box. Adopt that to all other quantities I
 * select." So every count of copies on a card is this tag; the website
 * draws the same one (src/components/ui/quantity-badge.tsx).
 *
 * Nothing for one copy, unless `always`. Position it from the caller.
 */
export function QuantityBadge({
  quantity,
  size = "sm",
  always = false,
  style,
}: {
  quantity: number;
  /**
   * Show "×1" too. Only a picker's picked result uses it, where the tag
   * says "picked" as much as how many; everywhere else one copy is no tag.
   */
  always?: boolean;
  /** "sm" on a thumbnail or pocket, "md" on a large card or a row. */
  size?: "sm" | "md";
  style?: StyleProp<ViewStyle>;
}) {
  if (!Number.isFinite(quantity) || quantity < 1 || (quantity === 1 && !always)) {
    return null;
  }
  return (
    <View
      pointerEvents="none"
      style={[
        {
          alignSelf: "flex-start",
          borderRadius: 999,
          backgroundColor: "rgba(0,0,0,0.75)",
          borderWidth: 1,
          borderColor: colors.borderStrong,
          paddingHorizontal: size === "sm" ? 5 : 7,
          paddingVertical: size === "sm" ? 1 : 2,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: size === "sm" ? 9 : 12,
          fontWeight: "700",
          fontVariant: ["tabular-nums"],
        }}
      >
        {`×${quantity}`}
      </Text>
    </View>
  );
}
