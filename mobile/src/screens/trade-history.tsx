import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import { getTradeHistory, type TradeHistory } from "../api";
import { colors, gutter, spacing } from "../theme";
import {
  LockedRows,
  monthOf,
  TradeHistoryRow,
  TradeHistoryTotalsRow,
  TradeHistoryWall,
} from "../trade-history";
import { Body, Card, Loading, Muted, Title } from "../ui";

/**
 * Every trade you confirmed, grouped by month, newest first: the
 * website's /profile/trades. The list is Pro; a free player gets the
 * counts, the faded stand-in and the pitch, and the server never sent
 * the rows.
 */
export function TradeHistoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [history, setHistory] = useState<TradeHistory | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      getTradeHistory()
        .then((result) => {
          if (!live) return;
          setHistory(result.history);
          setFailed(false);
        })
        .catch(() => {
          if (live) setFailed(true);
        });
      return () => {
        live = false;
      };
    }, []),
  );

  if (failed) {
    return (
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
        }}
      >
        <Muted>Your trade history could not be loaded. Try again in a moment.</Muted>
      </ScrollView>
    );
  }

  if (!history) {
    return <Loading />;
  }

  /* One card per month, so a year of Fridays reads as a calendar. */
  const months: { label: string; trades: TradeHistory["trades"] }[] = [];
  for (const trade of history.trades) {
    const label = monthOf(trade.confirmedAt);
    const last = months[months.length - 1];
    if (last && last.label === label) last.trades.push(trade);
    else months.push({ label, trades: [trade] });
  }

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: gutter,
        paddingVertical: spacing(4),
        gap: spacing(4),
      }}
    >
      <View style={{ gap: spacing(1) }}>
        <Title>Trade history</Title>
        <Body>Only you can see this. Stores see totals, never who traded what.</Body>
      </View>

      <View
        style={{
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          gap: spacing(1.5),
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.elevated,
          paddingHorizontal: spacing(3),
          paddingVertical: spacing(1),
        }}
      >
        <Ionicons name="flame" size={14} color={colors.accent} />
        <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 14 }}>
          {history.totals.embers.toLocaleString()}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>earned trading</Text>
      </View>

      <TradeHistoryTotalsRow totals={history.totals} />

      {history.locked ? (
        <View>
          <Card>
            <LockedRows count={6} />
          </Card>
          <TradeHistoryWall
            count={history.totals.trades}
            onGetPro={() => navigation.navigate("Pro")}
          />
        </View>
      ) : months.length === 0 ? (
        <Card>
          <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 15 }}>
            Nothing traded yet
          </Text>
          <Muted>
            Confirm a trade in a room and it lands here, with who it was with and what
            it paid.
          </Muted>
        </Card>
      ) : (
        months.map((month) => (
          <Card key={month.label}>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 11,
                fontWeight: "600",
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              {month.label}
            </Text>
            <View>
              {month.trades.map((trade, index) => (
                <TradeHistoryRow
                  key={trade.id}
                  trade={trade}
                  last={index === month.trades.length - 1}
                />
              ))}
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}
