import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { StackParams } from "../App";
import { SheetBackdrop } from "./action-menu";
import {
  ApiError,
  getStoreDays,
  getStorePicker,
  planVisit,
  rememberRoom,
  rememberRoomGame,
  searchStores,
  storedAccessToken,
  type StoreDays,
  type StorePicker,
} from "./api";
import { offerBringingAfterGoing } from "./bringing-sheet";
import { markFeedStale } from "./feed-refresh";
import { GOING, YOURE_GOING } from "./going-copy";
import { silentCoords } from "./location";
import { openRoom } from "./open-room";
import { SwipeToClose } from "./sheet-swipe";
import {
  CLOSED_THAT_DAY,
  PICK_A_STORE,
  PLAN_REFUSALS,
  SEARCH_STORES,
  STORES_NEAR_YOU,
  NO_STORES_FOUND,
  STORES_YOU_FOLLOW,
  WHICH_DAY,
  dayRoomLine,
  goingToStoreLine,
  planRefusal,
} from "./store-day-copy";
import { colors, radius, spacing } from "./theme";
import {
  AsyncButton,
  Button,
  ErrorLine,
  Input,
  Muted,
  SheetClose,
  Tap,
  Title,
} from "./ui";

/**
 * Plan a visit: the website's plan-visit sheet, the same two steps in
 * the same words.
 *
 * The founder (2026-10-09): "events are all posted elsewhere in the
 * respective TCG app's and it just creates an extra step for game
 * stores to set up events... I miss the simplicity of just getting into
 * a room." So a player says where and when, and that is the room:
 *
 *   1. PICK_A_STORE: a search, and while nothing is typed, the stores
 *      they follow and then the ones near them. The phone's position
 *      goes along only when permission was already given; this sheet
 *      never asks.
 *   2. WHICH_DAY at that store: seven day chips, the room on the
 *      chosen day if anyone opened it or the store posted a night, and
 *      one Going. Going lands in that day's room, opening it when it is
 *      the first, then the binders picker is offered exactly as after
 *      the Going button, and the room opens.
 *
 * Opened from three places (Rooms, a store's page, the Feed's "Where
 * do you play?"), so it is drawn by one host at the root, the binders
 * picker's way (src/bringing-sheet.tsx).
 */

/** How long the search waits for the typing to stop. */
const SEARCH_DEBOUNCE_MS = 250;

/** How long "You're going to Mox on Friday." stays before the room opens. */
const DONE_PAUSE_MS = 1400;

/** A store to plan at: straight to step 2 with one, step 1 without. */
export type PlanVisitAsk = { storeId?: string; storeName?: string };

type Chosen = { storeId: string; name: string };

/** One row in step 1: a store and where it is. */
type Row = { storeId: string; name: string; where: string | null };

let show: ((ask: PlanVisitAsk) => void) | null = null;

/** Opens the sheet over the app; nothing when no host is mounted. */
export function openPlanVisit(ask: PlanVisitAsk = {}): void {
  show?.(ask);
}

/** The root's sheet. Mounted once, inside the NavigationContainer. */
export function PlanVisitHost() {
  const [ask, setAsk] = useState<{ ask: PlanVisitAsk; at: number } | null>(null);

  useEffect(() => {
    show = (next) => setAsk({ ask: next, at: Date.now() });
    return () => {
      show = null;
    };
  }, []);

  if (!ask) return null;
  return <PlanVisitSheet key={ask.at} ask={ask.ask} onClose={() => setAsk(null)} />;
}

/** "3 mi" when the distance is known, the city otherwise. */
export function whereLine(miles: number | null, city: string | null): string | null {
  return miles !== null ? `${miles} mi` : city;
}

export function PlanVisitSheet({
  ask,
  onClose,
}: {
  ask: PlanVisitAsk;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [chosen, setChosen] = useState<Chosen | null>(
    ask.storeId ? { storeId: ask.storeId, name: ask.storeName ?? "" } : null,
  );

  return (
    /* Fade, not slide, as every sheet here: a sliding Modal carries its
       backdrop up with it. */
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <SheetBackdrop />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable onPress={onClose} style={{ flex: 1, justifyContent: "flex-end" }}>
          <SwipeToClose
            onClose={onClose}
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.panel,
              borderTopRightRadius: radius.panel,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing(4),
              paddingBottom: spacing(4) + insets.bottom,
              gap: spacing(3),
              maxHeight: "88%",
            }}
          >
            {chosen ? (
              <DayStep
                store={chosen}
                onBack={() => setChosen(null)}
                onClose={onClose}
              />
            ) : (
              <StoreStep onPick={setChosen} onClose={onClose} />
            )}
          </SwipeToClose>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Step 1: search, or the stores you follow and the ones near you. */
function StoreStep({
  onPick,
  onClose,
}: {
  onPick: (store: Chosen) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [picker, setPicker] = useState<StorePicker | null>(null);
  const [found, setFound] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);

  /* The picker, once: with the position only if it is already ours. */
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const position = await silentCoords().catch(() => null);
        const { picker: fresh } = await getStorePicker(position ?? undefined);
        if (live) setPicker(fresh);
      } catch {
        if (live) setPicker({ following: [], near: [] });
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  /* The search, once the typing stops. Two letters, as the server asks. */
  const trimmed = query.trim();
  useEffect(() => {
    if (trimmed.length < 2) {
      setFound(null);
      setFailed(false);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      searchStores(trimmed)
        .then(({ stores }) => {
          if (!live) return;
          setFailed(false);
          setFound(
            stores.map((store) => ({
              storeId: store.storeId,
              name: store.name,
              where: store.city,
            })),
          );
        })
        .catch(() => {
          if (live) setFailed(true);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [trimmed]);

  const rows = (list: StorePicker["following"]): Row[] =>
    list.map((store) => ({
      storeId: store.storeId,
      name: store.name,
      where: whereLine(store.miles, store.city),
    }));

  const searching = trimmed.length >= 2;

  return (
    <>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing(2),
        }}
      >
        <Title>{PICK_A_STORE}</Title>
        <SheetClose onPress={onClose} />
      </View>

      <Input
        value={query}
        onChangeText={setQuery}
        placeholder={SEARCH_STORES}
        accessibilityLabel={SEARCH_STORES}
        autoCorrect={false}
        returnKeyType="search"
      />

      <ScrollView
        style={{ flexGrow: 0 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ gap: spacing(3), paddingBottom: spacing(1) }}
      >
        {searching ? (
          failed ? (
            <ErrorLine message={PLAN_REFUSALS.unavailable} />
          ) : found === null ? (
            <ActivityIndicator color={colors.accent} />
          ) : found.length === 0 ? (
            <Muted>{NO_STORES_FOUND}</Muted>
          ) : (
            <StoreRows rows={found} onPick={onPick} />
          )
        ) : picker === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <>
            {picker.following.length > 0 ? (
              <Section title={STORES_YOU_FOLLOW}>
                <StoreRows rows={rows(picker.following)} onPick={onPick} />
              </Section>
            ) : null}
            {picker.near.length > 0 ? (
              <Section title={STORES_NEAR_YOU}>
                <StoreRows rows={rows(picker.near)} onPick={onPick} />
              </Section>
            ) : null}
          </>
        )}
      </ScrollView>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing(1.5) }}>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 12,
          fontWeight: "700",
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function StoreRows({ rows, onPick }: { rows: Row[]; onPick: (store: Chosen) => void }) {
  return (
    <View style={{ gap: spacing(1.5) }}>
      {rows.map((row) => (
        <Tap
          key={row.storeId}
          onPress={() => onPick({ storeId: row.storeId, name: row.name })}
          accessibilityLabel={row.name}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing(3),
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.elevated,
            paddingVertical: spacing(2.5),
            paddingHorizontal: spacing(3),
          }}
        >
          <Ionicons name="storefront-outline" size={18} color={colors.textSecondary} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              numberOfLines={1}
              style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "600" }}
            >
              {row.name}
            </Text>
            {row.where ? (
              <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 13 }}>
                {row.where}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Tap>
      ))}
    </View>
  );
}

/** Step 2: the store's week, the chosen day's room, and Going. */
function DayStep({
  store,
  onBack,
  onClose,
}: {
  store: Chosen;
  onBack: () => void;
  onClose: () => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [week, setWeek] = useState<StoreDays | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  /* Null until the keychain answers; a guest's Going is the sign-in door. */
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const alive = useRef(true);

  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  useEffect(() => {
    void storedAccessToken().then((token) => {
      if (alive.current) setSignedIn(Boolean(token));
    });
    getStoreDays(store.storeId)
      .then(({ days }) => {
        if (!alive.current) return;
        setWeek(days);
        /* The first day the store is open, selected to begin with. */
        setDate(days.days.find((day) => !day.closed)?.date ?? null);
      })
      .catch((caught: unknown) => {
        if (!alive.current) return;
        setLoadError(
          planRefusal(caught instanceof ApiError ? caught.code : "unavailable"),
        );
      });
  }, [store.storeId]);

  const name = week?.storeName ?? store.name;
  const day = week?.days.find((d) => d.date === date) ?? null;
  const room = day?.room ?? null;
  const noOpenTrading = Boolean(week && !week.openTrading && day && !room);

  const going = async () => {
    if (!week || !day) return;
    setError(null);
    try {
      const answer = await planVisit(store.storeId, day.date);
      if (!alive.current) return;
      /* A night you are going to is a Feed item from then on. */
      markFeedStale();
      setDone(goingToStoreLine(name, day.date, week.today));
      setTimeout(() => {
        /* Closed by hand in the meantime: they are going, and that is all. */
        if (!alive.current) return;
        onClose();
        void (async () => {
          /* Into the room the way the scanner goes: remembered, the
             game scope cleared, then the Room joins it. */
          if (answer.code) {
            await rememberRoom(answer.code);
            await rememberRoomGame(null);
            openRoom(navigation);
          }
          /* Then the binders picker, by the same rule as after Going. */
          if (answer.youGoing) void offerBringingAfterGoing(answer.eventId);
        })().catch(() => {});
      }, DONE_PAUSE_MS);
    } catch (caught) {
      if (!alive.current) return;
      setError(planRefusal(caught instanceof ApiError ? caught.code : "unavailable"));
    }
  };

  const toSignIn = () => {
    onClose();
    navigation.navigate("SignIn");
  };

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1) }}>
        <Tap
          onPress={onBack}
          accessibilityLabel="Back"
          style={{
            width: 44,
            height: 44,
            marginVertical: -11,
            marginLeft: -11,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
        </Tap>
        <View style={{ flex: 1 }}>
          <Title>{name}</Title>
        </View>
        <SheetClose onPress={onClose} />
      </View>

      <Muted>{WHICH_DAY}</Muted>

      {loadError ? (
        <ErrorLine message={loadError} />
      ) : !week ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ gap: spacing(2) }}
          >
            {week.days.map((d) => {
              const on = d.date === date;
              return (
                <Tap
                  key={d.date}
                  onPress={() => {
                    setDate(d.date);
                    setError(null);
                  }}
                  disabled={d.closed || done !== null}
                  accessibilityLabel={`${d.label}${d.closed ? `, ${CLOSED_THAT_DAY}` : ""}${on ? ", selected" : ""}`}
                  style={{
                    minWidth: 72,
                    alignItems: "center",
                    gap: 2,
                    borderRadius: radius.control,
                    borderWidth: 1,
                    borderColor: on ? colors.accent : colors.border,
                    backgroundColor: on ? colors.accentTint : colors.elevated,
                    paddingVertical: spacing(2),
                    paddingHorizontal: spacing(3),
                    opacity: d.closed ? 0.5 : 1,
                  }}
                >
                  <Text
                    style={{
                      color: on ? colors.accent : colors.textPrimary,
                      fontSize: 14,
                      fontWeight: "700",
                    }}
                  >
                    {d.label}
                  </Text>
                  {d.closed ? (
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      {CLOSED_THAT_DAY}
                    </Text>
                  ) : null}
                </Tap>
              );
            })}
          </ScrollView>

          {room ? (
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
              {dayRoomLine(room.name, room.goingCount)}
            </Text>
          ) : noOpenTrading ? (
            <Muted>{PLAN_REFUSALS["no-open-trading"]}</Muted>
          ) : null}

          {done ? (
            <Text style={{ color: colors.accent, fontSize: 15, fontWeight: "700" }}>
              {done}
            </Text>
          ) : signedIn === false ? (
            <Button label={GOING} onPress={toSignIn} disabled={!day} />
          ) : room?.youGoing ? (
            <Button
              label={YOURE_GOING}
              variant="secondary"
              disabled
              onPress={() => {}}
            />
          ) : (
            /* Dimmed by hand while it cannot go: this kit's disabled
               button otherwise looks exactly like an enabled one. */
            <View style={{ opacity: !day || noOpenTrading ? 0.5 : 1 }}>
              <AsyncButton
                label={GOING}
                pendingLabel={GOING}
                disabled={!day || noOpenTrading || signedIn === null}
                onPress={going}
              />
            </View>
          )}
          <ErrorLine message={error} />
        </>
      )}
    </>
  );
}
