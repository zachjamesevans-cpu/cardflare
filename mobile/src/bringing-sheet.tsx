import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { StackParams } from "../App";
import { SheetBackdrop } from "./action-menu";
import {
  ApiError,
  friendlyError,
  getNightBinders,
  saveNightBinders,
  type NightBinderPick,
  type NightBinderState,
} from "./api";
import { BinderCover } from "./binder-cover";
import {
  BRINGING_DONE,
  BRINGING_NO_BINDERS,
  BRINGING_PICKER_HINT,
  BRINGING_PICKER_TITLE,
  BRINGING_PROMISE,
  BRINGING_REFUSALS,
  BRINGING_SKIP,
  consentNeededLine,
  EVENT_ONLY_LABEL,
  PRIVATE_TAG,
  eventOnlyHint,
} from "./night-binder-copy";
import { SwipeToClose } from "./sheet-swipe";
import { colors, radius, spacing } from "./theme";
import { AsyncButton, Button, ErrorLine, Loading, SheetClose, Tap, Title } from "./ui";

/** The way to the profile's binders when there are none to pick. */
export const YOUR_BINDERS_LINK = "Your binders";
export const CLOSE = "Close";

/** "12 cards", "1 card": a tile's count, the Binders list's words. */
export function binderCardsLine(count: number): string {
  return `${count} ${count === 1 ? "card" : "cards"}`;
}

/**
 * Which binders are you bringing: the website's bringing-picker.tsx,
 * the same sheet with the same words.
 *
 * The founder (2026-10-09): "Add an attractive binder selection
 * interface within the existing Night RSVP experience. Show the user's
 * existing binders using their current cover artwork, names, and card
 * counts. Allow multiple binder selection with clear visual selection
 * states." So the grid is the binders as the profile draws them, the
 * cover first, and a tap rings the cover in the accent and pins a check
 * to its corner.
 *
 * A private binder never goes out by accident. Picking one opens a row
 * under the grid with its own switch, Show to this Night only, off to
 * begin with; while any picked private binder has it off, Done stays
 * disabled and the row says why. Nothing is shown that the owner did
 * not turn on, and nothing they picked is quietly left behind.
 *
 * `state` is what the server last said, or null to read it on opening.
 * Every opening starts from the server's picks.
 */
export function BringingSheet({
  eventId,
  state,
  onClose,
  onSaved,
}: {
  eventId: string;
  state: NightBinderState | null;
  onClose: () => void;
  onSaved?: (state: NightBinderState) => void;
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [loaded, setLoaded] = useState(state);
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    state ? choicesOf(state) : {},
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loaded) return;
    let live = true;
    getNightBinders(eventId)
      .then(({ state: fresh }) => {
        if (!live) return;
        setLoaded(fresh);
        setChoices(choicesOf(fresh));
      })
      .catch((caught) => {
        if (live) setError(refusalOf(caught));
      });
    return () => {
      live = false;
    };
  }, [eventId, loaded]);

  const binders = loaded?.binders ?? [];
  const picked = binders.filter((binder) => choices[binder.id]?.selected);
  const privatePicked = picked.filter((binder) => !binder.forTrade);
  const waiting = privatePicked.filter((binder) => !choices[binder.id]?.eventOnly);

  /* The private binder just picked: its switch sits under the grid,
     often below the fold, so the list scrolls down to it. */
  const scroller = useRef<ScrollView>(null);
  const [asking, setAsking] = useState<string | null>(null);
  useEffect(() => {
    if (!asking) return;
    const timer = setTimeout(
      () => scroller.current?.scrollToEnd({ animated: true }),
      60,
    );
    return () => clearTimeout(timer);
  }, [asking]);

  const toggle = (binderId: string) => {
    setError(null);
    const binder = binders.find((row) => row.id === binderId);
    if (binder && !binder.forTrade && !choices[binderId]?.selected) setAsking(binderId);
    setChoices((current) => {
      const was = current[binderId] ?? { selected: false, eventOnly: false };
      /* Unpicking forgets the switch, so picking again asks again. */
      return {
        ...current,
        [binderId]: was.selected
          ? { selected: false, eventOnly: false }
          : { selected: true, eventOnly: was.eventOnly },
      };
    });
  };

  const setEventOnly = (binderId: string, on: boolean) => {
    setError(null);
    setChoices((current) => ({
      ...current,
      [binderId]: { selected: true, eventOnly: on },
    }));
  };

  const save = async (picks: NightBinderPick[]) => {
    setError(null);
    try {
      const { state: fresh } = await saveNightBinders(eventId, picks);
      announce(eventId, fresh);
      onSaved?.(fresh);
      onClose();
    } catch (caught) {
      setError(refusalOf(caught));
    }
  };

  const done = () =>
    save(
      picked.map((binder) => ({
        binderId: binder.id,
        eventOnly: !binder.forTrade && (choices[binder.id]?.eventOnly ?? false),
      })),
    );

  const empty = loaded !== null && binders.length === 0;

  return (
    /* Fade, not slide, as every sheet here: a sliding Modal carries its
       backdrop up with it. */
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <SheetBackdrop />
      <Pressable onPress={onClose} style={{ flex: 1, justifyContent: "flex-end" }}>
        {/* Left edge or a pull down from the title row closes it
            (src/sheet-swipe.tsx), and it claims its own taps. */}
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
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing(2),
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Title>{BRINGING_PICKER_TITLE}</Title>
            </View>
            <SheetClose onPress={onClose} />
          </View>

          {!loaded ? (
            error ? (
              <ErrorLine message={error} />
            ) : (
              <Loading />
            )
          ) : empty ? (
            <View style={{ gap: spacing(3) }}>
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                {BRINGING_NO_BINDERS}
              </Text>
              <Button
                label={YOUR_BINDERS_LINK}
                onPress={() => {
                  onClose();
                  navigation.navigate("Binders");
                }}
              />
              <Button label={CLOSE} variant="secondary" onPress={onClose} />
            </View>
          ) : (
            <>
              <ScrollView
                ref={scroller}
                style={{ flexGrow: 0 }}
                contentContainerStyle={{ gap: spacing(4) }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                  {BRINGING_PICKER_HINT}
                </Text>

                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    columnGap: spacing(2),
                    rowGap: spacing(4),
                  }}
                >
                  {binders.map((binder) => {
                    const on = choices[binder.id]?.selected ?? false;
                    const cards = binderCardsLine(binder.count);
                    return (
                      <Tap
                        key={binder.id}
                        onPress={() => toggle(binder.id)}
                        accessibilityLabel={[
                          binder.name,
                          cards,
                          binder.forTrade ? null : PRIVATE_TAG,
                          on ? "selected" : null,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                        accessibilityState={{ selected: on }}
                        style={{ width: TILE, alignItems: "center", gap: spacing(1) }}
                      >
                        {/* The ring sits outside the cover with a gap of
                            the sheet's own colour, the website's
                            ring-offset; transparent when not picked so
                            nothing moves. */}
                        <View
                          style={{
                            padding: 2,
                            borderRadius: 10,
                            borderWidth: 2,
                            borderColor: on ? colors.accent : "transparent",
                            marginBottom: spacing(1),
                          }}
                        >
                          <BinderCover
                            cover={binder.cover}
                            label={binder.name}
                            size="sm"
                          />
                          {on ? (
                            <View
                              style={{
                                position: "absolute",
                                top: -8,
                                right: -8,
                                width: 20,
                                height: 20,
                                borderRadius: 10,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: colors.accent,
                              }}
                            >
                              <Ionicons
                                name="checkmark"
                                size={14}
                                color={colors.accentContrast}
                              />
                            </View>
                          ) : null}
                        </View>
                        <Text
                          numberOfLines={2}
                          style={{
                            alignSelf: "stretch",
                            textAlign: "center",
                            color: on ? colors.textPrimary : colors.textSecondary,
                            fontSize: 14,
                            fontWeight: "600",
                          }}
                        >
                          {binder.name}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                          {cards}
                        </Text>
                        {binder.forTrade ? null : (
                          <View
                            style={{
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: colors.border,
                              backgroundColor: colors.elevated,
                              paddingHorizontal: spacing(2),
                              paddingVertical: 2,
                            }}
                          >
                            <Text
                              maxFontSizeMultiplier={1.3}
                              style={{
                                color: colors.textSecondary,
                                fontSize: 10,
                                fontWeight: "600",
                              }}
                            >
                              {PRIVATE_TAG}
                            </Text>
                          </View>
                        )}
                      </Tap>
                    );
                  })}
                </View>

                {privatePicked.map((binder) => {
                  const on = choices[binder.id]?.eventOnly ?? false;
                  return (
                    <View
                      key={binder.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: spacing(3),
                        borderRadius: radius.control,
                        borderWidth: 1,
                        borderColor: on ? colors.border : colors.warning,
                        backgroundColor: colors.elevated,
                        padding: spacing(3),
                      }}
                    >
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text
                          style={{
                            color: colors.textPrimary,
                            fontSize: 14,
                            fontWeight: "600",
                          }}
                        >
                          {EVENT_ONLY_LABEL}
                        </Text>
                        <Text
                          style={{
                            color: on ? colors.textMuted : colors.warning,
                            fontSize: 12,
                          }}
                        >
                          {eventOnlyHint(binder.name)}
                        </Text>
                      </View>
                      <Switch
                        value={on}
                        onValueChange={(next) => setEventOnly(binder.id, next)}
                        trackColor={{ true: colors.accent, false: colors.borderStrong }}
                        thumbColor={colors.textPrimary}
                        accessibilityLabel={`${EVENT_ONLY_LABEL}, ${binder.name}`}
                        accessibilityHint={eventOnlyHint(binder.name)}
                      />
                    </View>
                  );
                })}

                <ErrorLine message={error} />
              </ScrollView>

              <View style={{ gap: spacing(2) }}>
                {waiting.length > 0 ? (
                  <Text style={{ color: colors.warning, fontSize: 12 }}>
                    {consentNeededLine(waiting.map((binder) => binder.name))}
                  </Text>
                ) : null}
                <View style={{ flexDirection: "row", gap: spacing(2) }}>
                  <View style={{ flex: 1 }}>
                    <AsyncButton
                      label={BRINGING_SKIP}
                      pendingLabel={BRINGING_SKIP}
                      variant="secondary"
                      onPress={() => save([])}
                    />
                  </View>
                  {/* Dimmed while a private pick waits on its switch:
                      the Button itself only dims while busy. */}
                  <View style={{ flex: 1, opacity: waiting.length > 0 ? 0.5 : 1 }}>
                    <AsyncButton
                      label={BRINGING_DONE}
                      pendingLabel={BRINGING_DONE}
                      disabled={waiting.length > 0}
                      onPress={done}
                    />
                  </View>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {BRINGING_PROMISE}
                </Text>
              </View>
            </>
          )}
        </SwipeToClose>
      </Pressable>
    </Modal>
  );
}

/** A tile: the sm cover (100 wide) inside its ring and the ring's gap. */
const TILE = 108;

type Choice = { selected: boolean; eventOnly: boolean };

function choicesOf(state: NightBinderState): Record<string, Choice> {
  return Object.fromEntries(
    state.binders.map((binder) => [
      binder.id,
      { selected: binder.selected, eventOnly: binder.eventOnly },
    ]),
  );
}

/** A refusal in the server's words: its code is one of BRINGING_REFUSALS. */
function refusalOf(caught: unknown): string {
  if (caught instanceof ApiError && caught.code in BRINGING_REFUSALS) {
    return BRINGING_REFUSALS[caught.code as keyof typeof BRINGING_REFUSALS];
  }
  return friendlyError(caught);
}

/* ---- One sheet for the whole app ------------------------------------ */

/*
 * The picker that opens after Going lives at the app's root, not in
 * the Going button. The night's header swaps the button for its
 * "Going" mark as soon as the room re-reads, and a sheet inside the
 * button would go with it, mid-pick. So the button asks, and the one
 * host in App.tsx draws the sheet over whatever screen is up.
 */

type Ask = {
  eventId: string;
  state: NightBinderState;
  onSaved?: (state: NightBinderState) => void;
};

let show: ((ask: Ask) => void) | null = null;

/** Opens the picker over the app; nothing when no host is mounted. */
export function askBringing(ask: Ask): void {
  show?.(ask);
}

/** The root's picker. Mounted once, inside the NavigationContainer. */
export function BringingHost() {
  const [ask, setAsk] = useState<Ask | null>(null);

  useEffect(() => {
    show = setAsk;
    return () => {
      if (show === setAsk) show = null;
    };
  }, []);

  if (!ask) return null;
  return (
    <BringingSheet
      key={ask.eventId}
      eventId={ask.eventId}
      state={ask.state}
      onClose={() => setAsk(null)}
      onSaved={ask.onSaved}
    />
  );
}

/*
 * A save, said to whoever is drawing that night's picks: the night's
 * "Your binders for tonight" row repaints from the saved state, from
 * whichever sheet saved it.
 */
const listeners = new Set<(eventId: string, state: NightBinderState) => void>();

function announce(eventId: string, state: NightBinderState) {
  for (const listener of listeners) listener(eventId, state);
}

/** Hears every save; returns the unsubscribe. */
export function onBringingSaved(
  listener: (eventId: string, state: NightBinderState) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * After a Going the server confirmed: the picker, when there is
 * something to pick and nothing picked yet. Never for a player with no
 * binders (no nag), never when the night takes no changes, and a read
 * that fails is just no picker: Going already worked.
 */
export async function offerBringingAfterGoing(
  eventId: string,
  onSaved?: (state: NightBinderState) => void,
): Promise<void> {
  try {
    const { state } = await getNightBinders(eventId);
    if (!state.editable || !state.going) return;
    if (state.binders.length === 0 || state.selectedCount > 0) return;
    askBringing({ eventId, state, onSaved });
  } catch {
    /* Garnish on Going; Going must not fail over it. */
  }
}
