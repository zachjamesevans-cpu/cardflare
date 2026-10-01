import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import { ActionSheet } from "../action-menu";
import {
  deleteLoggedTrade,
  describeError,
  getTradeHistory,
  type TradeHistory,
  type TradeHistoryEntry,
} from "../api";
import { colors, gutter, spacing } from "../theme";
import {
  isLogged,
  LockedRows,
  monthOf,
  TradeHistoryRow,
  TradeHistoryTotalsRow,
  TradeHistoryWall,
} from "../trade-history";
import { Body, Button, Card, ErrorLine, Loading, Muted, Tap, Title } from "../ui";

/** Which way the rows are filtered: client state, the website's chips. */
type Filter = "all" | "got" | "gave";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "got", label: "Got" },
  { key: "gave", label: "Gave" },
];

/**
 * Every trade you confirmed, grouped by month, newest first: the
 * website's /profile/trades. The list is Pro; a free player gets the
 * counts, the faded stand-in and the pitch, and the server never sent
 * the rows.
 *
 * Two kinds of row now. A room trade is what two people confirmed; a
 * logged one is what the player wrote down for a trade made off
 * CardFlare (the founder: "allow me to enter my own trades"). The
 * logged row says so, pays nothing, and is the one kind the player
 * can remove, from the three dots at its end.
 */
export function TradeHistoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const route = useRoute<RouteProp<StackParams, "TradeHistory">>();
  const [history, setHistory] = useState<TradeHistory | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  /* The row whose three dots are open, and what removing it said. */
  const [menuFor, setMenuFor] = useState<TradeHistoryEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getTradeHistory();
      setHistory(result.history);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

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

  const remove = async (trade: TradeHistoryEntry) => {
    setError(null);
    try {
      const result = await deleteLoggedTrade(trade.id);
      if (!result.ok) {
        setError("Could not remove that trade.");
        return;
      }
      await load();
    } catch (caught) {
      setError(`Could not remove that trade (${describeError(caught)}).`);
    }
  };

  /*
   * The two-step. A logged trade is the only kind that can go, and one
   * tap on "Remove" used to be enough to lose a row somebody typed in.
   * The confirm asks the website's question in the system's own dialog,
   * with Cancel first and the destructive choice marked as such.
   */
  const confirmRemove = (trade: TradeHistoryEntry) => {
    Alert.alert("Remove this trade?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void remove(trade) },
    ]);
  };

  /*
   * "Logged." is news for a moment, not a label for the visit. It
   * arrives as a route param from the log form and used to sit there
   * until the next form cleared it, so a row removed a minute later was
   * still captioned as just logged. Four seconds, then it goes.
   */
  const logged = route.params?.logged ?? false;
  useEffect(() => {
    if (!logged) return;
    const timer = setTimeout(() => navigation.setParams({ logged: undefined }), 4000);
    return () => clearTimeout(timer);
  }, [logged, navigation]);

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

  const shown = history.trades.filter((trade) =>
    filter === "all" ? true : filter === "got" ? trade.got : !trade.got,
  );

  /* One card per month, so a year of Fridays reads as a calendar. */
  const months: { label: string; trades: TradeHistory["trades"] }[] = [];
  for (const trade of shown) {
    const label = monthOf(trade.confirmedAt);
    const last = months[months.length - 1];
    if (last && last.label === label) last.trades.push(trade);
    else months.push({ label, trades: [trade] });
  }

  return (
    <>
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

        {/* The Embers pill, and the door to writing a trade down. The
            button goes when the rows are locked: the Pro wall below
            already makes the pitch. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: spacing(2),
          }}
        >
          <View
            style={{
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
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>
              earned trading
            </Text>
          </View>
          {!history.locked ? (
            <Button
              label="Log a trade"
              onPress={() => {
                /* The last "Logged." has been read; a new form starts clean. */
                navigation.setParams({ logged: undefined });
                navigation.navigate("LogTrade");
              }}
            />
          ) : null}
        </View>

        {logged ? <Muted>Logged.</Muted> : null}

        <TradeHistoryTotalsRow totals={history.totals} />

        {!history.locked ? (
          <View style={{ flexDirection: "row", gap: spacing(2) }}>
            {FILTERS.map((option) => {
              const on = filter === option.key;
              return (
                <Tap
                  key={option.key}
                  onPress={() => setFilter(option.key)}
                  accessibilityLabel={`Show ${option.label.toLowerCase()}`}
                  style={{
                    paddingHorizontal: spacing(3),
                    paddingVertical: spacing(1.5),
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: on ? colors.accent : colors.borderStrong,
                    backgroundColor: on ? colors.accent : "transparent",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: on ? colors.accentContrast : colors.textSecondary,
                    }}
                  >
                    {option.label}
                  </Text>
                </Tap>
              );
            })}
          </View>
        ) : null}

        <ErrorLine message={error} />

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
        ) : history.trades.length === 0 ? (
          <Card>
            <Text
              style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 15 }}
            >
              Nothing traded yet
            </Text>
            <Muted>
              Confirm a trade in a room and it lands here, with who it was with and what
              it paid.
            </Muted>
          </Card>
        ) : months.length === 0 ? (
          <Card>
            <Muted>
              {filter === "got" ? "Nothing got yet." : "Nothing given yet."}
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
                    onOpenPartner={
                      trade.partnerPlayerId
                        ? () =>
                            navigation.navigate("PlayerProfile", {
                              playerId: trade.partnerPlayerId ?? "",
                            })
                        : undefined
                    }
                    onMore={isLogged(trade) ? () => setMenuFor(trade) : undefined}
                  />
                ))}
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      {/* A logged row's extras, behind the three dots: one item, and
          a confirm behind it. A room trade is a thing two people did
          and has no menu. */}
      <ActionSheet
        items={
          menuFor
            ? [
                {
                  key: "remove",
                  label: "Remove",
                  icon: "trash-outline",
                  onPress: () => confirmRemove(menuFor),
                },
              ]
            : null
        }
        onClose={() => setMenuFor(null)}
      />
    </>
  );
}
