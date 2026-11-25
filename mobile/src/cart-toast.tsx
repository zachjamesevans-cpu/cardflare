import { useEffect, useRef } from "react";
import { Animated, Text, View, type ViewStyle } from "react-native";

import { colors, spacing } from "./theme";
import { Tap } from "./ui";

/**
 * "Added Perona · Alt Art", with "View Flare (3)" beside it: what the +
 * on a card says instead of sliding the composer up (flare-cart.ts).
 * It shows for a few seconds and goes; its button opens the full Flare.
 */
export function CartToast({
  line,
  count,
  onView,
  onGone,
  style,
}: {
  /** What was just added, or null for nothing showing. */
  line: string | null;
  count: number;
  onView: () => void;
  onGone: () => void;
  style?: ViewStyle;
}) {
  const shown = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!line) return;
    shown.setValue(0);
    Animated.timing(shown, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(shown, { toValue: 0, duration: 200, useNativeDriver: true }).start(
        ({ finished }) => finished && onGone(),
      );
    }, 3200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line]);

  if (!line) return null;
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        {
          position: "absolute",
          opacity: shown,
          transform: [
            { translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
          ],
        },
        style,
      ]}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing(3),
          paddingLeft: spacing(4),
          paddingRight: spacing(1.5),
          paddingVertical: spacing(1.5),
          borderRadius: 14,
          backgroundColor: colors.elevated,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: "#000",
          shadowOpacity: 0.4,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Text
          numberOfLines={1}
          style={{ flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: "600" }}
        >
          {/* "Added" first, so a long name cuts off its own end, not the verb. */}
          {`Added ${line}`}
        </Text>
        <Tap
          onPress={onView}
          accessibilityRole="button"
          style={{
            paddingHorizontal: spacing(3),
            paddingVertical: spacing(2),
            borderRadius: 10,
            backgroundColor: colors.accent,
          }}
        >
          <Text style={{ color: colors.accentContrast, fontSize: 13, fontWeight: "800" }}>
            {`View Flare (${count})`}
          </Text>
        </Tap>
      </View>
    </Animated.View>
  );
}
