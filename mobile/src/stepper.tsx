import { Text, View } from "react-native";

import { colors, radius, spacing } from "./theme";
import { Tap } from "./ui";

/**
 * A minus, a number, a plus.
 *
 * The one control every count in the product is set with: copies in
 * a Flare, copies found on a hunt, copies you can bring to an offer.
 * The zoom's offer form drew its own; this is the same shape, small
 * enough to sit inside a row, and it lives once so the three places
 * cannot drift apart.
 */
export function Stepper({
  value,
  min = 0,
  max = 99,
  onChange,
  label,
  disabled = false,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
  /** What the number is, for screen readers. */
  label: string;
  disabled?: boolean;
}) {
  const atMin = value <= min;
  const atMax = value >= max;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(1),
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Tap
        onPress={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || atMin}
        hitSlop={6}
        accessibilityLabel={`Fewer ${label}`}
        style={[step, atMin && { opacity: 0.4 }]}
      >
        <Text style={glyph}>−</Text>
      </Tap>
      <Text
        style={{
          color: colors.textPrimary,
          fontWeight: "700",
          fontSize: 15,
          minWidth: 22,
          textAlign: "center",
        }}
      >
        {value}
      </Text>
      <Tap
        onPress={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || atMax}
        hitSlop={6}
        accessibilityLabel={`More ${label}`}
        style={[step, atMax && { opacity: 0.4 }]}
      >
        <Text style={glyph}>+</Text>
      </Tap>
    </View>
  );
}

const step = {
  width: 30,
  height: 30,
  borderRadius: radius.control,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.elevated,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

const glyph = { color: colors.textPrimary, fontSize: 17, fontWeight: "700" as const };
