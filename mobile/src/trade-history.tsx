import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import type { TradeHistoryEntry, TradeHistoryTotals } from "./api";
import { RemoteImage } from "./remote-image";
import { colors, radius, spacing } from "./theme";
import { Button } from "./ui";

/**
 * The pieces of the trade history, shared by the card on the profile
 * and the screen so the two draw a trade the same way. The website's
 * src/components/trades/history.tsx, natively: one row is one card
 * and which way it went, the store and the day under it, the Embers
 * it paid at the end.
 */

/** "Fri, Sep 12", in the reader's own clock. */
export function dayOf(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

/** "September 2026", the group heading. */
export function monthOf(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(iso),
  );
}

function statusLine(trade: TradeHistoryEntry): string | null {
  switch (trade.status) {
    case "pending":
      return "Waiting on the other side to confirm";
    case "late":
      return "Not confirmed in time";
    case "disputed":
      return "Reversed. Its Embers were taken back.";
    case "unnamed":
      return "Nobody named, so it earned nothing";
    default:
      return null;
  }
}

const THUMB = 44;

export function TradeHistoryRow({
  trade,
  compact = false,
  last = false,
}: {
  trade: TradeHistoryEntry;
  /** On the profile card: no card number, one line of detail. */
  compact?: boolean;
  last?: boolean;
}) {
  const line = statusLine(trade);
  const detail = [
    trade.storeName,
    dayOf(trade.confirmedAt),
    compact ? null : trade.cardNumber,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(3),
        paddingVertical: spacing(3),
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          width: THUMB,
          height: Math.round((THUMB * 84) / 60),
          borderRadius: 5,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.elevated,
          overflow: "hidden",
        }}
      >
        {trade.imageUrl ? (
          <RemoteImage uri={trade.imageUrl} style={{ width: "100%", height: "100%" }} />
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}>
          <Ionicons
            name={trade.got ? "arrow-down-outline" : "arrow-up-outline"}
            size={14}
            color={trade.got ? colors.accent : colors.textMuted}
          />
          <Text numberOfLines={2} style={{ color: colors.textPrimary, fontSize: 14, flex: 1 }}>
            {trade.got ? "Got " : "Gave "}
            <Text style={{ fontWeight: "700" }}>{trade.cardName}</Text>
            {trade.quantity > 1 ? (
              <Text style={{ color: colors.textMuted }}>{` ×${trade.quantity}`}</Text>
            ) : null}
            {trade.partnerName ? (
              <>
                {trade.got ? " from " : " to "}
                <Text style={{ fontWeight: "700" }}>{trade.partnerName}</Text>
              </>
            ) : null}
          </Text>
        </View>
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
          {detail}
        </Text>
        {line && !compact ? (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{line}</Text>
        ) : null}
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 3,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: trade.embers > 0 ? colors.accentMuted : colors.border,
          backgroundColor: colors.elevated,
          paddingHorizontal: spacing(2),
          paddingVertical: 2,
        }}
      >
        <Ionicons
          name="flame"
          size={11}
          color={trade.embers > 0 ? colors.accent : colors.textMuted}
        />
        <Text
          style={{
            color: trade.embers > 0 ? colors.accent : colors.textMuted,
            fontSize: 12,
            fontWeight: "700",
          }}
        >
          {trade.embers > 0 ? `+${trade.embers}` : String(trade.embers)}
        </Text>
      </View>
    </View>
  );
}

/**
 * What a free player sees instead of rows: the shape of a list with
 * nothing in it, faded, so the wall reads as covering something. Drawn
 * from nothing - the server sent no rows to hide.
 */
export function LockedRows({ count }: { count: number }) {
  return (
    <View style={{ opacity: 0.35 }} pointerEvents="none">
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing(3),
            paddingVertical: spacing(3),
            borderBottomWidth: index === count - 1 ? 0 : 1,
            borderBottomColor: colors.border,
          }}
        >
          <View
            style={{
              width: THUMB,
              height: Math.round((THUMB * 84) / 60),
              borderRadius: 5,
              backgroundColor: colors.elevated,
            }}
          />
          <View style={{ flex: 1, gap: spacing(1.5) }}>
            <View style={{ height: 14, width: "75%", borderRadius: 4, backgroundColor: colors.elevated }} />
            <View style={{ height: 12, width: "50%", borderRadius: 4, backgroundColor: colors.elevated }} />
          </View>
          <View style={{ height: 20, width: 48, borderRadius: 999, backgroundColor: colors.elevated }} />
        </View>
      ))}
    </View>
  );
}

/** The Pro pitch over the faded rows. */
export function TradeHistoryWall({
  count,
  onGetPro,
}: {
  count: number;
  onGetPro: () => void;
}) {
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
        padding: spacing(2),
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 320,
          alignItems: "center",
          gap: spacing(3),
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.accentMuted,
          backgroundColor: colors.surface,
          padding: spacing(5),
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.accentMuted,
            backgroundColor: colors.elevated,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="lock-closed-outline" size={20} color={colors.accent} />
        </View>
        <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 16, textAlign: "center" }}>
          {count === 0
            ? "Your trades will be saved here"
            : count === 1
              ? "Your trade is saved"
              : `Your ${count} trades are saved`}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: "center" }}>
          See every card you got and gave, who it was with, and the Embers it earned, with
          cardflare Pro.
        </Text>
        <Button label="Get cardflare Pro" onPress={onGetPro} />
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>$7.99 a month</Text>
      </View>
    </View>
  );
}

/** Three numbers over the list: trades, got, gave. */
export function TradeHistoryTotalsRow({ totals }: { totals: TradeHistoryTotals }) {
  const cells: [number, string][] = [
    [totals.trades, totals.trades === 1 ? "trade" : "trades"],
    [totals.got, "got"],
    [totals.gave, "gave"],
  ];
  return (
    <View style={{ flexDirection: "row", gap: spacing(2) }}>
      {cells.map(([value, label]) => (
        <View
          key={label}
          style={{
            flex: 1,
            alignItems: "center",
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.elevated,
            paddingVertical: spacing(2),
          }}
        >
          <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 18 }}>
            {value}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{label}</Text>
        </View>
      ))}
    </View>
  );
}
