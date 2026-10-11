import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Text } from "react-native";

import { ActionSheet } from "./action-menu";
import { colors, spacing } from "./theme";
import { Tap } from "./ui";

/* The Nearby tab's header; what the tab shows is decided in nearby-plan.ts. */

const RADII = [10, 25, 50, 100] as const;

/** "📍 Near you · 50 mi ▾": where Nearby is looking, and how far. */
export function NearbyHeader({
  miles,
  onRadius,
}: {
  miles: number | null;
  onRadius: (miles: number) => void;
}) {
  const [picking, setPicking] = useState(false);
  return (
    <>
      <Tap
        onPress={() => setPicking(true)}
        accessibilityLabel={`Showing what is near you${miles ? ` within ${miles} miles` : ""}. Change distance`}
        style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}
      >
        <Ionicons name="location" size={16} color={colors.accent} />
        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700" }}>
          Near you
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 15 }}>
          {miles ? `· ${miles} mi` : "· Distance"}
        </Text>
        <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
      </Tap>
      <ActionSheet
        items={
          picking
            ? RADII.map((each) => ({
                key: `radius-${each}`,
                label: `Within ${each} miles`,
                icon: each === miles ? "checkmark-circle" : "ellipse-outline",
                onPress: () => onRadius(each),
              }))
            : null
        }
        onClose={() => setPicking(false)}
      />
    </>
  );
}
