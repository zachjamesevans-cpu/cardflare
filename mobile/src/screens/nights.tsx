import { HeaderButton } from "../header";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import type { StackParams } from "../../App";
import { ActionSheet, type ActionItem } from "../action-menu";
import {
  ApiError,
  forgetRoom,
  getNights,
  rememberRoom,
  storedAccessToken,
  type NightItem,
} from "../api";
import { cachedPlayerId, readCache, writeCache } from "../cache";
import { useTabBarInset } from "../glass";
import { GoingButton } from "../going-button";
import { GOING, NO_NIGHTS, SCAN_OR_CODE } from "../going-copy";
import {
  ENTER_CODE,
  GOING_EMPTY,
  NIGHT_TABS,
  PAST_EMPTY,
  SCAN_QR,
  matchesLine,
  playersLine,
} from "../night-copy";
import { openRoom } from "../open-room";
import { refreshTick } from "../refresh-tick";
import { colors, gutter, radius, spacing } from "../theme";
import { Body, Button, Card, Loading, Tap, Title } from "../ui";
import { VerifiedMark } from "../verified-mark";

/**
 * The Nights tab: the website's /nights, round 2.
 *
 * The founder (2026-10-03): "The current Nights landing page is too
 * large and sparse ... Redesign to be much denser and more useful."
 * The navigator's header says Nights with the QR icon at its end
 * (`NightsCodeButton`, mounted from App.tsx); under it the Going |
 * Nearby | Past row, Going by default; then one short card per night:
 * the date block, the name, the venue with its Verified glyph, the
 * start time, and one line with the RSVP state, "{n} players" and
 * "{n} matches" in the accent with the flame. "Potential matches
 * should have significantly more visual priority than generic
 * attendance." The whole card opens the night.
 */

/** How far past the top the thumb drags before a release refreshes. */
const PULL_TRIGGER = 80;

export type NightTab = keyof typeof NIGHT_TABS;

export const TAB_ORDER: NightTab[] = ["going", "nearby", "past"];

/**
 * Nearby with nothing on it, for somebody who already follows a store:
 * "follow a store" would be advice they have taken. The website's
 * `src/components/nights/night-list.tsx` says the same.
 */
export const STORES_QUIET = "Your stores haven't scheduled a night yet.";
export const SEE_NEARBY = "See what's nearby";
export const FIND_STORES = "Find stores near you";

/** The tab everyone lands on. */
export const DEFAULT_TAB: NightTab = "going";

/**
 * Which tab a night belongs to. Past is a night that has ended (the
 * server lists only the ones the viewer went to); Going is a night the
 * viewer said Going to that has not; Nearby is everything else.
 */
export function tabFor(night: NightItem): NightTab {
  if (night.phase === "finished") return "past";
  if (night.youGoing) return "going";
  return "nearby";
}

/** The month over the day, in the store's own zone: "OCT" and "03". */
export function dateBlock(
  iso: string,
  timeZone: string,
): { month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    timeZone,
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { month: part("month").toUpperCase(), day: part("day") };
}

/** "11:00 AM" in the store's zone, "Open now" live, "Ended" in Past. */
export function startLine(night: NightItem): string {
  if (night.phase === "live") return "Open now";
  if (night.phase === "finished") return "Ended";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: night.timeZone,
  }).format(new Date(night.startsAt));
}

/**
 * The QR icon at the end of the header, and the small sheet behind
 * it: Scan QR opens the scanner, Enter event code opens the Room
 * screen's code form. The Room screen reopens the last room when it
 * remembers one, so entering a code forgets it first: the person
 * tapped this because they want a different door.
 */
export function NightsCodeButton() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [items, setItems] = useState<ActionItem[] | null>(null);

  const open = () =>
    setItems([
      {
        key: "scan",
        label: SCAN_QR,
        icon: "qr-code-outline",
        onPress: () => navigation.navigate("Scan"),
      },
      {
        key: "code",
        label: ENTER_CODE,
        icon: "keypad-outline",
        onPress: () => {
          void forgetRoom().finally(() => openRoom(navigation));
        },
      },
    ]);

  return (
    <>
      <HeaderButton icon="qr-code-outline" label={SCAN_OR_CODE} onPress={open} />
      <ActionSheet items={items} onClose={() => setItems(null)} />
    </>
  );
}

/** Going | Nearby | Past: three equal segments. */
function NightTabs({
  value,
  onChange,
}: {
  value: NightTab;
  onChange: (tab: NightTab) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        borderRadius: radius.control + 4,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: 3,
      }}
    >
      {TAB_ORDER.map((tab) => {
        const on = tab === value;
        return (
          <Tap
            key={tab}
            onPress={() => onChange(tab)}
            accessibilityLabel={`${NIGHT_TABS[tab]}${on ? ", selected" : ""}`}
            style={{
              flex: 1,
              alignItems: "center",
              borderRadius: radius.control + 2,
              backgroundColor: on ? colors.elevated : "transparent",
              borderWidth: 1,
              borderColor: on ? colors.accent : "transparent",
              paddingVertical: spacing(2),
            }}
          >
            <Text
              style={{
                color: on ? colors.accent : colors.textSecondary,
                fontSize: 13,
                fontWeight: "700",
              }}
            >
              {NIGHT_TABS[tab]}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}

export function NightsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const tabInset = useTabBarInset();
  const [tab, setTab] = useState<NightTab>(DEFAULT_TAB);
  const [nights, setNights] = useState<NightItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /* Null until the keychain has answered, so a guest's empty state is
     never drawn over a signed-in player's list still on its way. */
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const inFlight = useRef(false);
  /* Whether a list has ever landed, read where state would be a render
     late: a failed reload keeps what is on screen, and only a screen
     with nothing on it reports the failure. */
  const haveList = useRef(false);

  const load = useCallback(async (alive: () => boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const token = await storedAccessToken();
      if (alive()) setSignedIn(Boolean(token));
      const fresh = await getNights();
      if (alive()) {
        haveList.current = true;
        setNights(fresh.nights);
        setFailed(false);
      }
      /* Remembered for the next open's paint, under this account. */
      const id = token ? await cachedPlayerId() : null;
      if (id) void writeCache("nights", id, fresh.nights);
    } catch (caught) {
      if (!alive()) return;
      /* A guest gets the list's empty answer, not an error: the server
         has nothing to list for an account it cannot see. */
      if (caught instanceof ApiError && caught.status === 401) {
        haveList.current = true;
        setNights([]);
        setFailed(false);
      } else if (!haveList.current) {
        setFailed(true);
      }
    } finally {
      inFlight.current = false;
    }
  }, []);

  /*
   * THE PAINT: last visit's list, drawn before getNights() answers, so
   * the tab opens on its nights rather than a spinner. The founder
   * (2026-10-05): "Same thing with everything else pretty much on the
   * main tabs." Only with a session, under this account, and only if
   * the real list has not landed first. The failure rules hold: a
   * painted list is something on screen, so a failed reload keeps it.
   */
  useEffect(() => {
    let live = true;
    void (async () => {
      if (!(await storedAccessToken())) return;
      const id = await cachedPlayerId();
      if (!id || !live) return;
      const cached = await readCache<NightItem[]>("nights", id);
      if (!cached || !live || haveList.current || !Array.isArray(cached)) return;
      setNights((current) => current ?? cached);
    })();
    return () => {
      live = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void load(() => live);
      return () => {
        live = false;
      };
    }, [load]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(() => true);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  /*
   * PULL TO REFRESH, DRAWN BY HAND, the Feed's way. React Native's
   * RefreshControl does not render in this app (measured on the
   * simulator, see the Feed), so the gesture is read off the scroll:
   * how far past the top the thumb has dragged, and what to do when it
   * lets go. The tick fires once at the crossing, the founder's "small
   * haptic vibration when it pulls all the way".
   */
  const pull = useSharedValue(0);
  const armed = useSharedValue(false);
  const askForRefresh = useCallback(() => {
    if (inFlight.current) return;
    void refresh();
  }, [refresh]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      pull.value = Math.max(0, -event.contentOffset.y);
      if (pull.value >= PULL_TRIGGER && !armed.value) {
        armed.value = true;
        runOnJS(refreshTick)();
      } else if (pull.value < PULL_TRIGGER * 0.75 && armed.value) {
        armed.value = false;
      }
    },
    onEndDrag: () => {
      armed.value = false;
      if (pull.value >= PULL_TRIGGER) runOnJS(askForRefresh)();
    },
  });

  /** A card opens its night: remembered, then the Room screen reads it. */
  const open = async (night: NightItem) => {
    if (!night.code) return;
    await rememberRoom(night.code);
    openRoom(navigation);
  };

  /* The spinner only when there is nothing to paint: no list, cached
     or fresh, and no failure to say instead. */
  if (nights === null && (signedIn === null || (signedIn && !failed))) {
    return <Loading />;
  }

  const rows = (nights ?? []).filter((night) => tabFor(night) === tab);
  /* Whether this player follows a store, as far as the list can say:
     any night on any tab at a store they follow. A followed store with
     no nights at all leaves no trace here, and reads as following none. */
  const followsAStore = (nights ?? []).some((night) => night.following);
  const loadFailed = failed && nights === null;

  return (
    <View style={{ flex: 1 }}>
      <PullSpinner pull={pull} refreshing={refreshing} />
      <Animated.ScrollView
        style={{ flex: 1 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(3),
          gap: spacing(2),
          paddingBottom: spacing(4) + tabInset,
        }}
      >
        <NightTabs value={tab} onChange={setTab} />

        {loadFailed ? (
          <Card>
            <Title>Could not load your nights</Title>
            <Body>Check your connection and pull to try again.</Body>
          </Card>
        ) : null}

        {rows.map((night) => (
          <NightCard
            key={night.eventId}
            night={night}
            onOpen={() => void open(night)}
            onStore={() =>
              navigation.navigate("StoreProfile", { storeId: night.storeId })
            }
          />
        ))}

        {/* Nothing on this tab: each tab's own line, the website's
            words, and a way onward. Going points at Nearby; Nearby
            points at the Feed's stores, in words that fit whether this
            player already follows one. */}
        {rows.length === 0 && !loadFailed ? (
          <View style={{ paddingVertical: spacing(4), gap: spacing(3) }}>
            {tab === "nearby" && followsAStore ? (
              <Body>{STORES_QUIET}</Body>
            ) : (
              <Body>
                {tab === "going" ? GOING_EMPTY : tab === "past" ? PAST_EMPTY : NO_NIGHTS}
              </Body>
            )}
            {tab === "going" ? (
              <Button
                label={SEE_NEARBY}
                variant="secondary"
                onPress={() => setTab("nearby")}
              />
            ) : null}
            {tab === "nearby" ? (
              <Button
                label={FIND_STORES}
                variant="secondary"
                onPress={() =>
                  navigation.navigate("Tabs", {
                    screen: "Feed",
                    params: { tab: "nearby", at: Date.now() },
                  })
                }
              />
            ) : null}
          </View>
        ) : null}
      </Animated.ScrollView>
    </View>
  );
}

/**
 * One night, short: the date block, the name, the venue with its
 * glyph, the start time, then one line with the RSVP state, the
 * players count and the matches. The whole card opens the night; the
 * store's name opens the store, as it does on the Feed.
 */
function NightCard({
  night,
  onOpen,
  onStore,
}: {
  night: NightItem;
  onOpen: () => void;
  onStore: () => void;
}) {
  const { month, day } = dateBlock(night.startsAt, night.timeZone);
  const past = night.phase === "finished";
  const live = night.phase === "live";
  const matches = night.matches ?? null;

  return (
    <Tap
      onPress={onOpen}
      disabled={!night.code}
      accessibilityLabel={night.name}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(3),
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: live ? colors.accent : colors.border,
        backgroundColor: colors.surface,
        paddingVertical: spacing(2.5),
        paddingHorizontal: spacing(3),
      }}
    >
      {/* The date, as a calendar page: month over day. */}
      <View
        style={{
          width: 44,
          alignItems: "center",
          borderRadius: radius.control,
          backgroundColor: colors.elevated,
          paddingVertical: spacing(1.5),
        }}
      >
        <Text
          maxFontSizeMultiplier={1.3}
          style={{
            color: live ? colors.accent : colors.textMuted,
            fontSize: 11,
            fontWeight: "800",
            letterSpacing: 1,
          }}
        >
          {month}
        </Text>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "800" }}>
          {day}
        </Text>
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 15 }}
        >
          {night.name}
        </Text>
        <Tap
          onPress={onStore}
          hitSlop={4}
          accessibilityLabel={night.storeName}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing(1),
            alignSelf: "flex-start",
          }}
        >
          <Text
            numberOfLines={1}
            style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600" }}
          >
            {night.storeName}
          </Text>
          {/* Verified is trust, drawn beside a store's name wherever
              the name is; never Ultra, which is a tier. */}
          {night.storeVerified ? <VerifiedMark size={14} /> : null}
        </Tap>
        <Text
          style={{
            color: live ? colors.accent : colors.textMuted,
            fontSize: 13,
            fontWeight: live ? "700" : "400",
          }}
        >
          {startLine(night)}
        </Text>

        {/* The one line: RSVP state, players, matches. Matches outrank
            attendance; with none to show, the players count has the slot. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            gap: spacing(2.5),
            marginTop: spacing(1),
          }}
        >
          {past ? null : night.youGoing ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Ionicons name="checkmark" size={14} color={colors.accent} />
              <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
                {GOING}
              </Text>
            </View>
          ) : (
            <GoingButton
              eventId={night.eventId}
              youGoing={false}
              goingCount={night.goingCount}
              withCount={false}
              size="chip"
            />
          )}
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            {playersLine(night.goingCount)}
          </Text>
          {matches !== null && matches > 0 ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Ionicons name="flame" size={13} color={colors.accent} />
              <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
                {matchesLine(matches)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Tap>
  );
}

/** The Feed's spinner: fades and grows with the pull, spins while the
    load runs. Above the list, so it never rides the content. */
function PullSpinner({
  pull,
  refreshing,
}: {
  pull: SharedValue<number>;
  refreshing: boolean;
}) {
  const drop = spacing(2);

  const style = useAnimatedStyle(() => ({
    opacity: refreshing ? 1 : interpolate(pull.value, [8, PULL_TRIGGER], [0, 1]),
    transform: [
      { scale: refreshing ? 1 : interpolate(pull.value, [8, PULL_TRIGGER], [0.6, 1]) },
      {
        translateY: refreshing
          ? 0
          : interpolate(pull.value, [0, PULL_TRIGGER], [0, drop]),
      },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top: spacing(2),
          left: 0,
          right: 0,
          alignItems: "center",
          zIndex: 5,
        },
        style,
      ]}
    >
      <ActivityIndicator size="small" color={colors.accent} />
    </Animated.View>
  );
}
