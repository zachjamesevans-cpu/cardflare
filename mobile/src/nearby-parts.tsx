import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { ActionSheet } from "./action-menu";
import type { StoreTile } from "./nearby-plan";
import { colors, radius, spacing } from "./theme";
import { Tap } from "./ui";

/* The Nearby tab's header and store row; what goes where is decided
   in nearby-plan.ts. */

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

/** The stores, one swipeable row of small tiles. */
export function StoreRow({
  stores,
  onOpen,
  bleed,
}: {
  stores: StoreTile[];
  onOpen: (tile: StoreTile) => void;
  /** The page's side padding, so the row can run to the screen's edges. */
  bleed: number;
}) {
  if (stores.length === 0) return null;
  return (
    <View style={{ gap: spacing(2) }}>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 12,
          fontWeight: "600",
          letterSpacing: 1.4,
          textTransform: "uppercase",
        }}
      >
        Stores
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -bleed }}
        contentContainerStyle={{ gap: spacing(2), paddingHorizontal: bleed }}
      >
        {stores.map((tile) => (
          <Tap
            key={tile.key}
            onPress={() => onOpen(tile)}
            accessibilityLabel={`${tile.name}, ${tile.status}`}
            style={{
              width: 148,
              gap: spacing(1.5),
              padding: spacing(3),
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: tile.live ? colors.accent : colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <Ionicons
              name="storefront-outline"
              size={20}
              color={colors.textSecondary}
            />
            <Text
              numberOfLines={2}
              style={{
                color: colors.textPrimary,
                fontSize: 14,
                fontWeight: "700",
                minHeight: 36,
              }}
            >
              {tile.name}
            </Text>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}
            >
              {tile.live ? (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.accent,
                  }}
                />
              ) : null}
              <Text
                numberOfLines={1}
                style={{
                  color: tile.live ? colors.accent : colors.textSecondary,
                  fontSize: 12,
                  fontWeight: tile.live ? "700" : "500",
                }}
              >
                {tile.status}
              </Text>
            </View>
          </Tap>
        ))}
      </ScrollView>
    </View>
  );
}
