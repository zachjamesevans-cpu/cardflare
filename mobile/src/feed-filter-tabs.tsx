import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { TAB_TITLES, type FeedTab } from "./api";
import { colors, radius, spacing } from "./theme";
import { Tap } from "./ui";

/**
 * Following | Nearby, under the wordmark.
 *
 * Two rounded segments. The one that is on wears the accent as a
 * border and a faint glow, the CardFlare green kept for the active
 * state; the others sit in muted grey. Same words and order as the
 * website's tabs, which read the same `tab` off every item.
 */
const ICONS: Record<FeedTab, keyof typeof Ionicons.glyphMap> = {
  following: "people-outline",
  nearby: "location-outline",
};

export const FEED_TABS: FeedTab[] = ["following", "nearby"];

export function FeedFilterTabs({
  value,
  onChange,
}: {
  value: FeedTab;
  onChange: (tab: FeedTab) => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: spacing(2) }}>
      {FEED_TABS.map((tab) => {
        const on = tab === value;
        return (
          <Tap
            key={tab}
            onPress={() => onChange(tab)}
            accessibilityLabel={`${TAB_TITLES[tab]}${on ? ", selected" : ""}`}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: spacing(1.5),
              borderRadius: radius.control + 4,
              borderWidth: 1,
              borderColor: on ? colors.accent : colors.border,
              backgroundColor: on ? "rgba(198,238,79,0.08)" : colors.surface,
              paddingVertical: spacing(2.5),
              paddingHorizontal: spacing(2),
              shadowColor: colors.accent,
              shadowOpacity: on ? 0.35 : 0,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 0 },
            }}
          >
            <Ionicons
              name={ICONS[tab]}
              size={16}
              color={on ? colors.accent : colors.textSecondary}
            />
            <Text
              numberOfLines={1}
              style={{
                color: on ? colors.accent : colors.textSecondary,
                fontSize: 13,
                fontWeight: "700",
              }}
            >
              {TAB_TITLES[tab]}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}
