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
  type FlareHistoryEntry,
  friendlyError,
  getFlareHistory,
  getTradeHistory,
  type TradeHistory,
  type TradeHistoryEntry,
} from "../api";
import {
  groupByMonth,
  HISTORY_FILTERS,
  historyItems,
  type HistoryFilter,
} from "../history-items";
import { colors, gutter, spacing } from "../theme";
import {
  FlareHistoryRow,
  isLogged,
  LockedRows,
  monthOf,
  TradeHistoryRow,
  TradeHistoryTotalsRow,
  TradeHistoryWall,
} from "../trade-history";
import { Body, Button, Card, ErrorLine, Loading, Muted, Tap, Title } from "../ui";

/** What the chips say when a filter has nothing to show. The website's. */
const EMPTY: Record<HistoryFilter, { title: string; body: string }> = {
  trades: {
    title: "Nothing traded yet",
    body: "Confirm a trade in a room, or log one you made elsewhere, and it lands here.",
  },
  flares: {
    title: "No past Flares yet",
    body: "A Flare lands here once it is found, traded or taken down.",
  },
  all: {
    title: "Nothing here yet",
    body: "Your trades, and your Flares once they are found, traded or taken down, land here.",
  },
};

/**
 * History: every trade you confirmed or logged, and every Flare that
 * has finished (found, traded or taken down) with who answered it,
 * grouped by month, newest first, behind chips All · Trades · Flares.
 * All merges the two by date. The website's /profile/trades.
 *
 * The trade rows are Pro, exactly as they were: a free player gets the
 * counts, the faded stand-in and the pitch, and the server never sent
 * the rows. The Flare rows are free, a player's own log of their own
 * posts (GET /api/v1/flares/history).
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
  /* The past Flares: null until they land. A failure reads as none
     (an older server has no such endpoint) and says so in one line. */
  const [flares, setFlares] = useState<FlareHistoryEntry[] | null>(null);
  const [flaresFailed, setFlaresFailed] = useState(false);
  const [filter, setFilter] = useState<HistoryFilter>("all");
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
      getFlareHistory()
        .then((result) => {
          if (!live) return;
          setFlares(Array.isArray(result.flares) ? result.flares : []);
          setFlaresFailed(false);
        })
        .catch(() => {
          if (!live) return;
          setFlares((current) => current ?? []);
          setFlaresFailed(true);
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
      setError(`Could not remove that trade. ${friendlyError(caught)}`);
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
        <Muted>Your history could not be loaded. Try again in a moment.</Muted>
      </ScrollView>
    );
  }

  if (!history || flares === null) {
    return <Loading />;
  }

  const showTrades = filter !== "flares";
  const showFlares = filter !== "trades";
  /* Locked, the server sent no trade rows: there is nothing to merge. */
  const items = historyItems(filter, history.locked ? [] : history.trades, flares);
  /* One card per month, so a year of Fridays reads as a calendar. */
  const months = groupByMonth(items, monthOf);

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
          <Title>History</Title>
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

        {/* All · Trades · Flares, the website's chips in its order. Shown
            locked too: the Flares are free. */}
        <View style={{ flexDirection: "row", gap: spacing(2) }}>
          {HISTORY_FILTERS.map((option) => {
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

        {showTrades ? <TradeHistoryTotalsRow totals={history.totals} /> : null}

        <ErrorLine message={error} />
        {showFlares && flaresFailed ? (
          <Muted>Your past Flares could not be loaded. Try again in a moment.</Muted>
        ) : null}

        {/* Pro gating, unchanged: no trade rows were sent to hide. */}
        {showTrades && history.locked ? (
          <View>
            <Card>
              <LockedRows count={6} />
            </Card>
            <TradeHistoryWall
              count={history.totals.trades}
              onGetPro={() => navigation.navigate("Pro")}
            />
          </View>
        ) : null}

        {months.length === 0 ? (
          /* Locked, the wall above already says what is not here. */
          history.locked && showTrades ? null : (
            <Card>
              <Text
                style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 15 }}
              >
                {EMPTY[filter].title}
              </Text>
              <Muted>{EMPTY[filter].body}</Muted>
            </Card>
          )
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
                {month.items.map((item, index) => {
                  const last = index === month.items.length - 1;
                  if (item.kind === "flare") {
                    return (
                      <FlareHistoryRow
                        key={`flare-${item.flare.flareId}`}
                        flare={item.flare}
                        last={last}
                        onOpenCard={(cardId) => navigation.navigate("Card", { cardId })}
                        onOpenThread={(threadId) =>
                          navigation.navigate("LocalThread", { threadId })
                        }
                      />
                    );
                  }
                  const trade = item.trade;
                  return (
                    <TradeHistoryRow
                      key={`trade-${trade.id}`}
                      trade={trade}
                      last={last}
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
                  );
                })}
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
