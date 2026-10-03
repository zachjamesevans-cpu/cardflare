import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useRef, useState } from "react";
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
import {
  ApiError,
  getNights,
  rememberRoom,
  storedAccessToken,
  type NightItem,
} from "../api";
import { useTabBarInset } from "../glass";
import { GoingButton } from "../going-button";
import { goingLine, NO_NIGHTS, SCAN_OR_CODE } from "../going-copy";
import { openRoom } from "../open-room";
import { refreshTick } from "../refresh-tick";
import { colors, gutter, radius, spacing } from "../theme";
import { Body, Button, Card, Loading, Tap, Title } from "../ui";
import { VerifiedMark } from "../verified-mark";

/**
 * The Nights tab: the website's /nights.
 *
 * The founder (2026-10-03): "What if, you just say you're going to an
 * event. Or a tournament night. That room stays 'open' and anyone can
 * go into there and see who is looking for which cards before the
 * tournament or event starts." And on the dock: "Trying to keep our
 * tabs to our 'hero's'." So the Room's slot is this list: every night
 * at a store you follow or near you, and every night you are going to
 * wherever it is, for the next fourteen days. Live rooms first, then
 * by start time; the server orders and the app keeps that order.
 *
 * Three sections, each drawn only when it has rows: "Live now",
 * "You're going", "Coming up". A row is the night, the store (with
 * the Verified glyph where the store has it), when, "{n} going" and
 * the Going button, and the whole row opens the room. Under the list,
 * "Scan or enter a code" is the door to the Room screen that used to
 * be this tab: scanning and typing a code live there, unchanged.
 */

/** How far past the top the thumb drags before a release refreshes. */
const PULL_TRIGGER = 80;

type SectionKey = "live" | "going" | "coming";

const SECTION_TITLES: Record<SectionKey, string> = {
  live: "Live now",
  going: "You're going",
  coming: "Coming up",
};

const SECTION_ORDER: SectionKey[] = ["live", "going", "coming"];

/** Which section a night belongs in: a live room first, whatever else
    is true of it; then the ones you said Going to; then the rest. */
export function sectionFor(night: NightItem): SectionKey {
  if (night.phase === "live") return "live";
  if (night.youGoing) return "going";
  return "coming";
}

/**
 * "Fri, Sep 25, 6:30 PM" in the store's own zone: the same words the
 * store screen's `whenAt` says, and the website's `formatEventMoment`
 * without the zone abbreviation a phone's locale does not need.
 */
function whenAt(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

export function NightsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const tabInset = useTabBarInset();
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

  /** A row opens its room: remembered, then the Room screen reads it. */
  const open = async (night: NightItem) => {
    if (!night.code) return;
    await rememberRoom(night.code);
    openRoom(navigation);
  };

  if (nights === null && signedIn === null) {
    return <Loading />;
  }

  const sections = SECTION_ORDER.map((key) => ({
    key,
    title: SECTION_TITLES[key],
    rows: (nights ?? []).filter((night) => sectionFor(night) === key),
  })).filter((section) => section.rows.length > 0);

  return (
    <View style={{ flex: 1 }}>
      <PullSpinner pull={pull} refreshing={refreshing} />
      <Animated.ScrollView
        style={{ flex: 1 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
          gap: spacing(4),
          paddingBottom: spacing(4) + tabInset,
        }}
      >
        {failed && nights === null ? (
          <Card>
            <Title>Could not load your nights</Title>
            <Body>Check your connection and pull to try again.</Body>
          </Card>
        ) : null}

        {sections.map((section) => (
          <Card key={section.key}>
            <Title>{section.title}</Title>
            <View>
              {section.rows.map((night, index) => (
                <NightRow
                  key={night.eventId}
                  night={night}
                  first={index === 0}
                  onOpen={() => void open(night)}
                  onStore={() =>
                    navigation.navigate("StoreProfile", { storeId: night.storeId })
                  }
                />
              ))}
            </View>
          </Card>
        ))}

        {/* Nothing in any section: the website's empty state, word for
            word, with the Feed as the way to a store to follow. */}
        {sections.length === 0 && !(failed && nights === null) ? (
          <Card>
            <Body>{NO_NIGHTS}</Body>
            <Button
              label="Open the Feed"
              variant="secondary"
              onPress={() => navigation.navigate("Tabs", { screen: "Feed" })}
            />
          </Card>
        ) : null}

        {/* The old Room tab, one tap away: the scanner and the code
            field live there, unchanged. */}
        <Button
          label={SCAN_OR_CODE}
          variant="secondary"
          onPress={() => openRoom(navigation)}
        />
      </Animated.ScrollView>
    </View>
  );
}

/**
 * One night: the name, the store with its glyph, when, who is going,
 * and the button. The whole row opens the room; the store's name
 * opens the store, as it does on the Feed.
 */
function NightRow({
  night,
  first,
  onOpen,
  onStore,
}: {
  night: NightItem;
  first: boolean;
  onOpen: () => void;
  onStore: () => void;
}) {
  return (
    <View
      style={{
        gap: spacing(2),
        paddingVertical: spacing(3),
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      <Tap
        onPress={onOpen}
        disabled={!night.code}
        accessibilityLabel={night.name}
        style={{ gap: spacing(0.5) }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
          <Text style={{ color: colors.textPrimary, fontWeight: "700", flex: 1 }}>
            {night.name}
          </Text>
          {night.phase === "live" ? (
            <Text
              style={{
                color: colors.accent,
                fontSize: 11,
                fontWeight: "700",
                letterSpacing: 1.2,
                textTransform: "uppercase",
                backgroundColor: colors.elevated,
                borderRadius: radius.control,
                paddingHorizontal: spacing(2),
                paddingVertical: spacing(0.5),
                overflow: "hidden",
              }}
            >
              Live
            </Text>
          ) : null}
        </View>
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
            style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600" }}
          >
            {night.storeName}
          </Text>
          {/* Verified is trust, drawn beside a store's name wherever
              the name is; never Ultra, which is a tier. */}
          {night.storeVerified ? <VerifiedMark size={14} /> : null}
          {night.city ? (
            <Text
              style={{ color: colors.textMuted, fontSize: 13 }}
            >{` · ${night.city}`}</Text>
          ) : null}
        </Tap>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          {whenAt(night.startsAt, night.timeZone)}
        </Text>
      </Tap>
      {/* A live room's door is the code and the QR, as on the room
          page and the website's list; the row shows the count only. */}
      {night.phase === "live" ? (
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          {goingLine(night.goingCount)}
        </Text>
      ) : (
        <GoingButton
          eventId={night.eventId}
          youGoing={night.youGoing}
          goingCount={night.goingCount}
          size="chip"
        />
      )}
    </View>
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
