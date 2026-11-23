import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, Switch, Text, View } from "react-native";

import type { StackParams } from "../../App";
import { setNearbyMatching } from "../api";
import { LAB_GAMES } from "../search-lab-games";
import { TraderRow, TradersNotice } from "../trader-row";
import { useTraders } from "../traders";
import { Tap } from "../ui";
import { colors, gutter, radius, spacing } from "../theme";

/** The radii Nearby already offers (src/lib/local/shared.ts). */
const RADII = [10, 25, 50, 100] as const;

/**
 * TRADERS NEAR YOU, the whole list (the UI experiment): everyone near you
 * who switched on Nearby matching and has cards up for trade, nearest
 * first after the ones holding cards you hunt. Filters: how far, which
 * game, and only people with a card you hunt. Pull down to look again.
 *
 * Only real people and the server's own counts: see
 * src/lib/nearby/traders.ts for what is and is never counted.
 */
export function TradersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [radiusMiles, setRadius] = useState<number | null>(null);
  const [game, setGame] = useState<string | null>(null);
  const [matchingOnly, setMatchingOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const filters = useMemo(
    () => ({ radius: radiusMiles, game, matchingOnly }),
    [radiusMiles, game, matchingOnly],
  );
  const { view, reload, askLocation } = useTraders(filters);
  const shownRadius = radiusMiles ?? (view.state === "ok" ? view.radius : null);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ padding: gutter, paddingBottom: spacing(10), gap: spacing(4) }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.accent}
          onRefresh={async () => {
            setRefreshing(true);
            await reload();
            setRefreshing(false);
          }}
        />
      }
    >
      <View style={{ gap: spacing(3) }}>
        <Chips
          label="Distance"
          items={RADII.map((miles) => ({ key: String(miles), label: `${miles} mi`, on: shownRadius === miles }))}
          onPick={(key) => setRadius(Number(key))}
        />
        <Chips
          label="Game"
          items={[
            { key: "all", label: "All", on: game === null },
            ...LAB_GAMES.filter((entry) => entry.catalog).map((entry) => ({
              key: entry.slug,
              label: entry.name,
              on: game === entry.slug,
            })),
          ]}
          onPick={(key) => setGame(key === "all" ? null : key)}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: spacing(1),
          }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "600" }}>
            Only people with cards I hunt
          </Text>
          <Switch
            value={matchingOnly}
            onValueChange={setMatchingOnly}
            trackColor={{ true: colors.accent, false: colors.elevated }}
            accessibilityLabel="Only people with cards I hunt"
          />
        </View>
      </View>

      <View
        style={{
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: spacing(4),
          paddingVertical: spacing(1),
        }}
      >
        <TradersNotice
          view={view}
          filtered={game !== null || matchingOnly}
          onTurnOn={() => void setNearbyMatching(true).then(() => reload())}
          onZip={() => navigation.navigate("Settings", { section: "privacy" })}
          onLocation={() => void askLocation()}
          onRetry={() => void reload()}
        />
        {view.state === "ok"
          ? view.traders.map((trader, index) => (
              <TraderRow
                key={trader.playerId}
                trader={trader}
                first={index === 0}
                onPress={() => navigation.navigate("PlayerProfile", { playerId: trader.playerId })}
              />
            ))
          : null}
      </View>

      <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17 }}>
        Only players who switched on Nearby matching show here, measured from their ZIP
        area, never an address. Counts are cards in binders they put up for trade.
      </Text>
    </ScrollView>
  );
}

function Chips({
  label,
  items,
  onPick,
}: {
  label: string;
  items: { key: string; label: string; on: boolean }[];
  onPick: (key: string) => void;
}) {
  return (
    <View style={{ gap: spacing(1.5) }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 0.6 }}>
        {label.toUpperCase()}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing(2) }}>
        {items.map((item) => (
          <Tap
            key={item.key}
            onPress={() => onPick(item.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: item.on }}
            accessibilityLabel={item.label}
            style={{
              height: 34,
              justifyContent: "center",
              paddingHorizontal: spacing(3.5),
              borderRadius: 999,
              borderWidth: 1,
              borderColor: item.on ? colors.accent : colors.border,
              backgroundColor: item.on ? colors.accent : colors.surface,
            }}
          >
            <Text
              style={{
                color: item.on ? colors.accentContrast : colors.textPrimary,
                fontSize: 13,
                fontWeight: "700",
              }}
            >
              {item.label}
            </Text>
          </Tap>
        ))}
      </ScrollView>
    </View>
  );
}
