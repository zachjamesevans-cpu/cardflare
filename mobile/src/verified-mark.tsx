import { MaterialCommunityIcons } from "@expo/vector-icons";
import { View } from "react-native";

import { colors } from "./theme";

/**
 * cardflare Verified, the app's drawing of the website's glyph: a shop
 * in the brand green, round, small enough to sit beside a name. The
 * website draws its own SVG storefront; the app has no SVG library,
 * so it wears the icon set's storefront on the same green disc, which
 * reads as the same mark at the sizes it is shown.
 */
export function VerifiedMark({ size = 16 }: { size?: number }) {
  return (
    <View
      accessibilityLabel="cardflare Verified"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.accent,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <MaterialCommunityIcons
        name="storefront"
        size={Math.round(size * 0.66)}
        color={colors.canvas}
      />
    </View>
  );
}
