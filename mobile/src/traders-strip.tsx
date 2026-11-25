import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo } from "react";
import { Text, View } from "react-native";

import type { StackParams } from "../App";
import { setNearbyMatching } from "./api";
import { TraderRow, TradersNotice } from "./trader-row";
import { useTraders } from "./traders";
import { Tap } from "./ui";
import { colors, spacing } from "./theme";

/** How many traders the Nearby tab shows before "See all". */
const STRIP_COUNT = 3;

/**
 * TRADERS NEAR YOU, at the top of the Nearby tab (the UI experiment,
 * src/ui-experiment.ts): the nearest few people with cards up for
 * trade, those with cards you hunt first, and the door to all of them.
 * Below it the Nearby tab is exactly what it was: Flares near you.
 */
export function TradersStrip({
  onCount,
}: {
  /** How many traders are near, once known: the Flares' empty state reads it. */
  onCount?: (count: number) => void;
} = {}) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const filters = useMemo(() => ({ radius: null, game: null, matchingOnly: false }), []);
  const { view, reload, askLocation } = useTraders(filters);
  const traders = view.state === "ok" ? view.traders : [];
  useEffect(() => {
    if (view.state === "ok") onCount?.(view.traders.length);
  }, [view, onCount]);

  /* Nobody near: nothing here. The tab's one empty state below says it,
     with the Flares, instead of a box saying it twice. */
  if (view.state === "ok" && traders.length === 0) return null;

  /*
   * No box: a section like Search's, its heading and the rows on the page.
   * The founder (2026-11-25), of the Nearby tab: "weird to have those text
   * blocks then more text between them."
   */
  return (
    <View style={{ gap: spacing(1) }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing(2) }}>
        <Text accessibilityRole="header" style={{ flex: 1, color: colors.textPrimary, fontSize: 19, fontWeight: "800" }}>
          Traders near you
        </Text>
        {traders.length > 0 ? (
          <Tap onPress={() => navigation.navigate("Traders")} hitSlop={8} accessibilityLabel="See all traders near you">
            <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "700" }}>See all</Text>
          </Tap>
        ) : null}
      </View>
      {view.state === "ok" && traders.some((trader) => trader.matchCount > 0) ? (
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          {`${traders.filter((trader) => trader.matchCount > 0).length} have cards you hunt`}
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
