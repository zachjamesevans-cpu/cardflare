import { Ionicons } from "@expo/vector-icons";
import { capsLabel, DISPLAY_SEMI } from "./fonts";
import { Text, View } from "react-native";

import type { NearbyTrader } from "./api";
import { formatHandle } from "./handle";
import { PlayerAvatar } from "./player-avatar";
import { matchLine, tradeCountLine, type TradersView } from "./traders";
import { Tap } from "./ui";
import { colors, spacing } from "./theme";

/** "<2 MI", "7 MI": the distance as short as TUKAR's, still only rounded. */
export function shortDistance(miles: number): string {
  return miles < 2 ? "<2 mi" : `${Math.round(miles)} mi`;
}

/**
 * One trader near you (the UI experiment): face, name, handle and
 * rough distance, how many cards they have up for trade, and - when
 * any of them are cards you hunt - that, in the accent. A tap opens
 * their profile, where their binders up for trade already are.
 */
export function TraderRow({
  trader,
  first,
  onPress,
}: {
  trader: NearbyTrader;
  first: boolean;
  onPress: () => void;
}) {
  const matches = matchLine(trader.matchCount);
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={[
        trader.displayName,
        trader.milesLabel,
        tradeCountLine(trader.tradeCount),
        matches,
      ]
        .filter(Boolean)
        .join(", ")}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(3),
        paddingVertical: spacing(3),
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      <PlayerAvatar
        displayName={trader.displayName}
        seed={trader.playerId}
        avatarUrl={trader.avatarUrl}
        frame={trader.frame}
        size={46}
      />
      {/* TUKAR's arrangement, in our colours: the name large, the
          handle and distance under it in spaced capitals, the count on
          the right. */}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 19, fontFamily: DISPLAY_SEMI }}>
          {trader.displayName}
        </Text>
        <Text numberOfLines={1} style={[capsLabel(11), { color: colors.textMuted }]}>
          {[trader.handle ? formatHandle(trader.handle) : null, shortDistance(trader.miles)]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        {matches ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="locate" size={12} color={colors.accent} />
            <Text numberOfLines={1} style={[capsLabel(11, true), { color: colors.accent }]}>
              {/* Short, so the spaced capitals keep to one line. */}
              {`${trader.matchCount} ${trader.matchCount === 1 ? "hunt match" : "hunt matches"}`}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={[capsLabel(11, true), { color: colors.textPrimary }]}>
        {`${trader.tradeCount.toLocaleString("en-US")} for trade`}
      </Text>
    </Tap>
  );
}

/**
 * What to say when there is no list: every honest reason, each with the
 * one thing that fixes it. Returns null for a list to draw.
 */
export function TradersNotice({
  view,
  filtered,
  onTurnOn,
  onZip,
  onLocation,
  onRetry,
}: {
  view: TradersView;
  /** A game or "match my Hunts" filter is narrowing the list. */
  filtered: boolean;
  onTurnOn: () => void;
  onZip: () => void;
  onLocation: () => void;
  onRetry: () => void;
}) {
  const say = (line: string, action?: string, onAction?: () => void) => (
    <View style={{ paddingVertical: spacing(3), gap: spacing(2) }}>
      <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>{line}</Text>
      {action && onAction ? (
        <Tap onPress={onAction} accessibilityLabel={action}>
          <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "700" }}>{action}</Text>
        </Tap>
      ) : null}
    </View>
  );

  switch (view.state) {
    case "loading":
      return (
        <View style={{ gap: spacing(3), paddingVertical: spacing(2) }}>
          {[0, 1, 2].map((index) => (
            <View key={index} style={{ flexDirection: "row", gap: spacing(3), alignItems: "center" }}>
              <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.elevated }} />
              <View style={{ flex: 1, gap: 6 }}>
                <View style={{ width: "55%", height: 12, borderRadius: 6, backgroundColor: colors.elevated }} />
                <View style={{ width: "35%", height: 10, borderRadius: 5, backgroundColor: colors.surface }} />
              </View>
            </View>
          ))}
        </View>
      );
    case "off":
      return say(
        "See who near you has cards up for trade. Switch on Nearby matching: you show up for people near you too, by ZIP area only, never an address.",
        "Turn on Nearby matching",
        onTurnOn,
      );
    case "no-location":
      return say(
        "Add your ZIP code or use your location to see traders near you.",
        "Use my location",
        onLocation,
      );
    case "denied":
      return say(
        "Location is off for cardflare. Add your ZIP code instead, or allow location in iOS Settings.",
        "Add a ZIP code",
        onZip,
      );
    case "unavailable":
    case "error":
      return say("Couldn't load traders near you.", "Try again", onRetry);
    case "ok":
      if (view.traders.length > 0) return null;
      return say(
        filtered
          ? `Nobody within ${view.radius} miles matches these filters yet.`
          : `Nobody within ${view.radius} miles has cards up for trade yet. Put a binder up for trade and you'll be the first.`,
      );
  }
}
