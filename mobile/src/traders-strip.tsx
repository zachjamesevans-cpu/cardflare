import { Ionicons } from "@expo/vector-icons";
import { DISPLAY_HEAVY } from "./fonts";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo } from "react";
import { Text, View } from "react-native";

import type { StackParams } from "../App";
import { setNearbyMatching } from "./api";
import { TraderRow, TradersNotice } from "./trader-row";
import { useTraders } from "./traders";
import { Tap } from "./ui";
import { colors, radius, spacing } from "./theme";

/** How many traders the Nearby tab shows before "See all". */
const STRIP_COUNT = 3;

/**
 * TRADERS NEAR YOU, at the top of the Nearby tab (the UI experiment,
 * src/ui-experiment.ts): the nearest few people with cards up for
 * trade, those with cards you hunt first, and the door to all of them.
 * Below it the Nearby tab is exactly what it was: Flares near you.
 */
export function TradersStrip() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const filters = useMemo(() => ({ radius: null, game: null, matchingOnly: false }), []);
  const { view, reload, askLocation } = useTraders(filters);
  const traders = view.state === "ok" ? view.traders : [];

  return (
    <View
      style={{
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing(4),
        paddingTop: spacing(4),
        paddingBottom: spacing(1),
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
        <Ionicons name="people" size={18} color={colors.accent} />
        <Text accessibilityRole="header" style={{ flex: 1, color: colors.textPrimary, fontSize: 19, fontFamily: DISPLAY_HEAVY }}>
          Traders near you
        </Text>
        {traders.length > 0 ? (
          <Tap onPress={() => navigation.navigate("Traders")} hitSlop={8} accessibilityLabel="See all traders near you">
            <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "700" }}>See all</Text>
          </Tap>
        ) : null}
      </View>
      {view.state === "ok" && traders.length > 0 ? (
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
          {`${traders.length} within ${view.radius} mi`}
          {traders.some((trader) => trader.matchCount > 0)
            ? ` · ${traders.filter((trader) => trader.matchCount > 0).length} have cards you hunt`
            : ""}
        </Text>
      ) : null}
      <TradersNotice
        view={view}
        filtered={false}
        onTurnOn={() => void setNearbyMatching(true).then(() => reload())}
        onZip={() => navigation.navigate("Settings", { section: "privacy" })}
        onLocation={() => void askLocation()}
        onRetry={() => void reload()}
      />
      {traders.slice(0, STRIP_COUNT).map((trader, index) => (
        <TraderRow
          key={trader.playerId}
          trader={trader}
          first={index === 0}
          onPress={() => navigation.navigate("PlayerProfile", { playerId: trader.playerId })}
        />
      ))}
    </View>
  );
}
