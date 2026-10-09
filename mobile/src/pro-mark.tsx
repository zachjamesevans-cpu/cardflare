import { Text, type TextStyle } from "react-native";

import { colors } from "./theme";

/**
 * PRO, in the brand's own lime, glowing: the founder (2026-10-09) asked
 * for "a glowing green pro moniker that matches our main brand color" on
 * the site and in the app. The website draws the same with `.pro-mark`
 * (src/app/globals.css) through `ProMark`. Read aloud as "Pro".
 */
export function ProMark({ size = 14, style }: { size?: number; style?: TextStyle }) {
  return (
    <Text
      accessibilityLabel="Pro"
      style={[
        {
          color: colors.accent,
          fontSize: size,
          fontWeight: "800",
          letterSpacing: size * 0.08,
          textShadowColor: colors.accent,
          textShadowRadius: Math.max(6, size * 0.6),
          textShadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    >
      PRO
    </Text>
  );
}
