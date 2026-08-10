import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  LayoutAnimation,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { StackParams } from "../../App";
import {
  ApiError,
  confirmTrade,
  getMe,
  getRoom,
  joinRoom,
  lastRoom,
  rememberBoardView,
  storedBoardView,
  type BoardView,
  offerOnFlare,
  postFlare,
  withdrawOffer,
  rememberRoom,
  removeFlare,
  setOpenToTrades,
  storedAccessToken,
  type Me,
  type RoomFlare,
  type RoomState,
} from "../api";
import {
  Body,
  Button,
  Card,
  CardImage,
  ErrorLine,
  Input,
  Muted,
  Tap,
  Title,
} from "../ui";
import { colors, radius, spacing } from "../theme";

// The website's room ticker runs at twelve seconds now; the app keeps
// the same rhythm so an offer never looks slower in the pocket client.
const POLL_MS = 12_000;

/**
 * The Room tab — the app's rendering of `/e/[code]`, at the website's
 * depth: the lobby with presence, the board grouped under whoever posted
 * (because "who do I go and talk to" is the actual question), offers
 * with a where-to-find-me note, open-to-trades, and a bottom action bar
 * that keeps Post a Flare one thumb away.
 */
export function RoomTab() {
  const [code, setCode] = useState<string | null>(null);
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();

  useFocusEffect(
    useCallback(() => {
      void lastRoom().then(setCode);
    }, []),
  );

  if (!code) {
    return (
      <View style={{ padding: spacing(4) }}>
        <Card>
          <Title>No room yet</Title>
          <Body>
            Scan a store&rsquo;s counter code from the Join tab and the room lives
            here.
          </Body>
          <Button label="Scan a code" onPress={() => navigation.navigate("Scan")} />
        </Card>
      </View>
    );
  }

  return <RoomScreen code={code} onSwitch={setCode} />;
}

function RoomScreen({
  code,
  onSwitch,
}: {
  code: string;
  /** Jump this tab to another room — how an early board is stepped into. */
  onSwitch: (code: string) => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [state, setState] = useState<RoomState | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [wants, setWants] = useState<Me["wants"]>([]);
  const [view, setView] = useState<BoardView>("carousel");

  /*
   * "Never mind" on the re-post banner. Without it the banner could only
   * be obeyed; the founder called it out. Per visit, not forever: the
   * wants stay saved, and switching rooms asks the question fresh.
   */
  const [repostDismissed, setRepostDismissed] = useState(false);

  /*
   * The roster folds shut by default — the founder's call: ten names
   * above the board pushed the product below the fold, and the counts
   * are what a scanning eye needs. LayoutAnimation makes the unfold
   * slide instead of snap.
   */
  const [rosterOpen, setRosterOpen] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    void storedBoardView().then(setView);
  }, []);

  const pickView = (next: BoardView) => {
    setView(next);
    void rememberBoardView(next).catch(() => {});
  };

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;

    try {
      const fresh = await getRoom(code);
      setState(fresh);
      setError(null);

      // The account's saved wants ride along so the room can offer to
      // re-post what is still outstanding — the whole point of signing in.
      if (fresh.joined && (await storedAccessToken())) {
        try {
          setWants((await getMe()).wants);
        } catch {
          setWants([]);
        }
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 404
          ? "That code does not point at a room."
          : "Could not reach the room. Check your connection and pull to retry.",
      );
    } finally {
      inFlight.current = false;
    }
  }, [code]);

  useEffect(() => {
    setState(null);
    setRepostDismissed(false);
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      await joinRoom(code, name.trim() || undefined);
      await refresh();
    } catch (caught) {
      // The reason is named so a field report can say what actually failed.
      setError(
        caught instanceof ApiError
          ? caught.code === "not-open"
            ? "This room is not open right now."
            : caught.code === "timeout"
              ? "That took too long. Check your connection and try again."
              : caught.code === "rate-limited"
                ? "Too many joins from here just now. Wait a minute and try again."
                : `Could not join (${caught.code}). Try again.`
          : "Could not join. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  /** Every board action: do it, re-read the truth, never crash the screen. */
  const act = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch {
      // The re-render shows the truthful state either way.
    }
    await refresh();
  };

  if (!state) {
    return (
      <View style={{ padding: spacing(4), gap: spacing(3) }}>
        <ErrorLine message={error} />
        {!error && <Muted>Loading the room…</Muted>}
        {error && <Button label="Try again" onPress={() => void refresh()} />}
      </View>
    );
  }

  /* A sleeping counter code: joining is what opens the walk-in room. */
  if (state.state === "lobby") {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
        <Card>
          {state.store && <Muted>{state.store.name}</Muted>}
          <Title>Nothing on yet. Start the room</Title>
          <Body>
            Trading is open here. Pick a name and you&rsquo;re in; the room opens
            with you.
          </Body>
          <ErrorLine message={error} />
          <Input
            value={name}
            onChangeText={setName}
            placeholder="Display name"
            autoCapitalize="words"
          />
          <Button
            label={busy ? "Joining…" : "Join"}
            onPress={() => void join()}
            busy={busy}
          />
        </Card>

        {/* Nothing at the counter — but a board may already be taking
            Flares, which is exactly what someone checking from home wants. */}
        {state.earlyBoard && (
          <Card>
            <Title>{`${state.earlyBoard.name} is taking Flares early`}</Title>
            <Body>
              {`The board for ${new Date(state.earlyBoard.startsAt).toLocaleDateString(
                "en-US",
                { weekday: "long", month: "short", day: "numeric" },
              )} is already open.${
                state.earlyBoard.playersIn > 0
                  ? ` ${state.earlyBoard.playersIn} ${
                      state.earlyBoard.playersIn === 1 ? "player is" : "players are"
                    } already on it.`
                  : ""
              } Post now so people know what to bring.`}
            </Body>
            <Button
              label="Open the early board"
              onPress={() => {
                const early = state.earlyBoard;
                if (!early) return;
                void rememberRoom(early.code).then(() => onSwitch(early.code));
              }}
            />
          </Card>
        )}
      </ScrollView>
    );
  }

  if (state.state !== "room") {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
        <Card>
          <Title>
            {state.state === "quiet"
              ? "Nothing on right now"
              : "Open this one on the website"}
          </Title>
          <Body>
            {state.state === "quiet"
              ? "This store is not running a room at the moment. Ask at the counter."
              : "Card shows live on cardflare.gg for now. Scan the same code there."}
          </Body>
        </Card>

        {/* Nothing at the counter — but a board may already be taking
            Flares, which is exactly what someone checking from home wants. */}
        {state.earlyBoard && (
          <Card>
            <Title>{`${state.earlyBoard.name} is taking Flares early`}</Title>
            <Body>
              {`The board for ${new Date(state.earlyBoard.startsAt).toLocaleDateString(
                "en-US",
                { weekday: "long", month: "short", day: "numeric" },
              )} is already open.${
                state.earlyBoard.playersIn > 0
                  ? ` ${state.earlyBoard.playersIn} ${
                      state.earlyBoard.playersIn === 1 ? "player is" : "players are"
                    } already on it.`
                  : ""
              } Post now so people know what to bring.`}
            </Body>
            <Button
              label="Open the early board"
              onPress={() => {
                const early = state.earlyBoard;
                if (!early) return;
                void rememberRoom(early.code).then(() => onSwitch(early.code));
              }}
            />
          </Card>
        )}
      </ScrollView>
    );
  }

  const room = state.room!;

  if (!state.joined) {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
        <Card>
          <Muted>{room.storeName}</Muted>
          <Title>{room.name}</Title>
          {room.status !== "open" && !room.early ? (
            <Body>This room is not open right now.</Body>
          ) : (
            <>
              <Body>Pick a name people in the room will recognise.</Body>
              <ErrorLine message={error} />
              <Input
                value={name}
                onChangeText={setName}
                placeholder="Display name"
                autoCapitalize="words"
              />
              <Button
                label={busy ? "Joining…" : "Join the room"}
                onPress={() => void join()}
                busy={busy}
              />
            </>
          )}
        </Card>
      </ScrollView>
    );
  }

  const youId = state.you!.sessionId;
  const participants = state.participants ?? [];
  const flares = state.flares ?? [];
  const youOpen = participants.some(
    (p) => p.playerSessionId === youId && p.openToTrades,
  );

  /* Outstanding = saved but not already my open Flare here, same rule as
     the website's re-post panel. */
  const myAsks = new Set(
    flares
      .filter((f) => f.playerSessionId === youId)
      .map((f) => `${f.cardId}:${f.printingId ?? ""}`),
  );
  const outstanding = wants.filter(
    (want) => !myAsks.has(`${want.cardId}:${want.printingId ?? ""}`),
  );

  /* The board groups under whoever posted, same as the website. */
  const groups = new Map<string, { name: string | null; flares: RoomFlare[] }>();
  for (const flare of flares) {
    const group = groups.get(flare.playerSessionId) ?? {
      name: flare.displayName,
      flares: [],
    };
    group.flares.push(flare);
    groups.set(flare.playerSessionId, group);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing(4), gap: spacing(3), paddingBottom: spacing(24) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accent}
            onRefresh={() => {
              setRefreshing(true);
              void refresh().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <Card>
          <Muted>{room.storeName}</Muted>
          <Title>{room.name}</Title>
          <Muted>{`You're in as ${state.you!.displayName}`}</Muted>

          {/* The file-browser trick: same board, two geometries. */}
          <View style={{ flexDirection: "row", gap: spacing(2) }}>
            {(["carousel", "stacked"] as const).map((option) => (
              <Tap
                key={option}
                onPress={() => pickView(option)}
                style={{
                  borderColor: view === option ? colors.accent : colors.border,
                  borderWidth: 1,
                  borderRadius: radius.control,
                  paddingVertical: spacing(1.5),
                  paddingHorizontal: spacing(3),
                }}
              >
                <Text
                  style={{
                    color: view === option ? colors.accent : colors.textMuted,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {option === "carousel" ? "Carousel" : "Stacked"}
                </Text>
              </Tap>
            ))}
          </View>
        </Card>

        {/* An early board never pretends to be a live room. */}
        {room.early && (
          <Card>
            <Title>This board is open early</Title>
            <Body>
              {`Everyone here is still on their way. The event starts ${
                room.startsAt
                  ? new Date(room.startsAt).toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })
                  : "soon"
              }. Post what you're hunting so people know what to bring from home.`}
            </Body>
          </Card>
        )}

        {outstanding.length > 0 && !repostDismissed && (
          <Card>
            <Title>Still hunting these from last time?</Title>
            <Body>
              {outstanding
                .map((w) =>
                  w.printingLabel ? `${w.cardName} (${w.printingLabel})` : w.cardName,
                )
                .join(" · ")}
            </Body>
            <Button
              label={`Post ${outstanding.length === 1 ? "it" : `all ${outstanding.length}`} to this room`}
              onPress={() =>
                void act(async () => {
                  for (const want of outstanding) {
                    await postFlare(code, {
                      cardId: want.cardId,
                      printingId: want.printingId,
                      quantity: want.quantity,
                      note: want.note ?? undefined,
                      deckLabel: want.deckLabel,
                    }).catch(() => {});
                  }
                })
              }
            />
            <Button
              label="Never mind"
              variant="secondary"
              onPress={() => setRepostDismissed(true)}
            />
          </Card>
        )}

        {/* The lobby: counts up front, names one tap behind the chevron. */}
        <Card>
          <Tap
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setRosterOpen((current) => !current);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing(2),
            }}
          >
            <Title>In this room</Title>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}
            >
              <Muted>
                {`${participants.filter((p) => p.present).length} here now · ${participants.length} total`}
              </Muted>
              <MaterialCommunityIcons
                name={rosterOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color={colors.textMuted}
              />
            </View>
          </Tap>

          {rosterOpen && (
            <View style={styles.lobby}>
              {[...participants]
                .sort((a, b) => Number(b.present) - Number(a.present))
                .map((p) => (
                  <View key={p.playerSessionId} style={styles.person}>
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: p.present ? colors.accent : colors.border },
                      ]}
                    />
                    <Text style={{ color: colors.textSecondary }} numberOfLines={1}>
                      {p.displayName ?? "A player"}
                      {p.playerSessionId === youId ? " (you)" : ""}
                      {p.openToTrades ? " · open to trades" : ""}
                    </Text>
                  </View>
                ))}
            </View>
          )}
        </Card>

        {groups.size === 0 && (
          <Card>
            <Body>No Flares yet. Post the first one and the room will see it.</Body>
          </Card>
        )}

        {[...groups.entries()].map(([sessionId, group]) => {
          const mine = sessionId === youId;

          /*
           * A player's section splits into deck folders and loose cards,
           * same as the website: "RG Luffy" typed on each card of the
           * hunt gathers them under one named heading.
           */
          const { folders, loose } = partitionByDeck(group.flares);

          const tile = (flare: RoomFlare) => {
            const own = flare.offers.find((o) => o.responderSessionId === youId);

            return (
              <CarouselFlare
                key={flare.id}
                flare={flare}
                mine={mine}
                offered={Boolean(own)}
                ownQuantity={own?.quantity ?? 1}
                early={room.early}
                onOffer={(quantity) =>
                  act(() => offerOnFlare(code, flare.id, undefined, quantity))
                }
                onWithdraw={() => act(() => withdrawOffer(code, flare.id))}
                onRemove={() => void act(() => removeFlare(code, flare.id))}
              />
            );
          };

          /* Fully pledged hunts park at the rail's far end, dimmed but
             present — the bring-extras crowd can still see the ask. */
          const isCovered = (flare: RoomFlare) =>
            flare.offers.length > 0 &&
            pledgeTally(flare.offers, flare.quantity).remaining === 0;

          const railFlares = [...folders.flatMap((f) => f.flares), ...loose];
          const orderedRail = [
            ...railFlares.filter((f) => !isCovered(f)),
            ...railFlares.filter(isCovered),
          ];

          const rows = (list: RoomFlare[]) =>
            list.map((flare) => (
              <FlareRow
                key={flare.id}
                flare={flare}
                mine={mine}
                storeName={room.storeName}
                early={room.early}
                onOffer={(message, quantity) =>
                  void act(() => offerOnFlare(code, flare.id, message, quantity))
                }
                onRemove={() => void act(() => removeFlare(code, flare.id))}
                onTraded={(partner) =>
                  void act(() => confirmTrade(code, flare.id, partner))
                }
              />
            ));

          return (
            <Card key={sessionId}>
              <Title>
                {mine ? "Your Flares" : (group.name ?? "A player")}
              </Title>

              {/*
               * Carousel: ONE rail per player, every tile the same shape —
               * the founder asked for the folder's cards to look exactly
               * like the loose ones (the bordered chip read as clutter).
               * The partition keeps a deck's cards side by side, and each
               * names its deck in its own caption. Stacked keeps the
               * header-then-rows shape.
               */}
              {view === "carousel" ? (
                <View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{
                      gap: spacing(2),
                      paddingVertical: spacing(1),
                      alignItems: "flex-start",
                    }}
                  >
                    {orderedRail.map(tile)}
                  </ScrollView>
                  {/* The founder's ask: the edge fades so the rail visibly
                      continues instead of the last card looking cut off. */}
                  <LinearGradient
                    pointerEvents="none"
                    colors={[`${colors.surface}00`, colors.surface]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.railFade}
                  />
                </View>
              ) : (
                <>
                  {folders.map((folder) => (
                    <View
                      key={folder.label.toLowerCase()}
                      style={{ gap: spacing(1) }}
                    >
                      <Text style={styles.folderLabel} numberOfLines={1}>
                        {`${folder.label} · ${folder.flares.length} ${
                          folder.flares.length === 1 ? "card" : "cards"
                        }`}
                      </Text>
                      <View>{rows(folder.flares)}</View>
                    </View>
                  ))}

                  {loose.length > 0 && <View>{rows(loose)}</View>}
                </>
              )}
            </Card>
          );
        })}
      </ScrollView>

      {/* The action bar: the two things a thumb reaches for in a room. */}
      <View style={styles.actionBar}>
        <View style={{ flex: 1 }}>
          <Button
            label="Post a Flare"
            onPress={() => navigation.navigate("PostFlare", { code })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={youOpen ? "Open to trades ✓" : "I'm open to trades"}
            variant="secondary"
            onPress={() => void act(() => setOpenToTrades(code, !youOpen))}
          />
        </View>
      </View>
    </View>
  );
}

/** The website's pledge arithmetic, in miniature: how much of the ask is
    spoken for, and what is still missing. */
function pledgeTally(
  offers: RoomFlare["offers"],
  asked: number,
): { pledged: number; remaining: number } {
  const total = offers.reduce((sum, offer) => sum + offer.quantity, 0);
  return {
    pledged: Math.min(total, asked),
    remaining: Math.max(0, asked - total),
  };
}

/** The one-line coverage caption a tile or row shows the whole room. */
function pledgeLineFor(flare: RoomFlare): string | null {
  if (flare.offers.length === 0) return null;
  const { remaining } = pledgeTally(flare.offers, flare.quantity);
  if (remaining === 0) {
    return flare.quantity > 1 ? `All ${flare.quantity} spoken for` : "Spoken for";
  }
  return `Needs ${remaining} more`;
}

/** The website's partition, in miniature: folders merge case-insensitively
    and keep the spelling of the first card seen; order follows the board. */
function partitionByDeck(flares: RoomFlare[]): {
  folders: { label: string; flares: RoomFlare[] }[];
  loose: RoomFlare[];
} {
  const folders = new Map<string, { label: string; flares: RoomFlare[] }>();
  const loose: RoomFlare[] = [];

  for (const flare of flares) {
    const label = flare.deckLabel?.trim();

    if (!label) {
      loose.push(flare);
      continue;
    }

    const key = label.toLowerCase();
    const existing = folders.get(key);

    if (existing) {
      existing.flares.push(flare);
    } else {
      folders.set(key, { label, flares: [flare] });
    }
  }

  return { folders: [...folders.values()], loose };
}

/**
 * One Flare as the carousel shows it: a contact sheet, not a row.
 *
 * Sized so five cards share a phone's width — the founder's number,
 * after two rounds of "still too big". At this size the tile is for
 * browsing: art (tap to zoom for the rest), name, count, and one-line
 * signals. The quick offer stays as a text link; writing a note,
 * reading offers and confirming trades live in the stacked view.
 */
function CarouselFlare({
  flare,
  mine,
  offered,
  ownQuantity,
  early,
  onOffer,
  onWithdraw,
  onRemove,
}: {
  flare: RoomFlare;
  mine: boolean;
  /** The viewer's pledge on this Flare is already standing. */
  offered: boolean;
  /** How many the standing pledge promised, the stepper's start. */
  ownQuantity: number;
  early: boolean;
  onOffer: (quantity?: number) => Promise<void>;
  onWithdraw: () => Promise<void>;
  onRemove: () => void;
}) {
  const covered =
    flare.offers.length > 0 &&
    pledgeTally(flare.offers, flare.quantity).remaining === 0;

  /*
   * "I got it" was a silent button: nothing on screen said the tap took
   * until the next poll repainted the board, which on store wifi reads
   * as broken — the founder's complaint. While the pledge is in flight
   * the art greys out under a spinner, and the button cannot double-fire.
   */
  const [pledging, setPledging] = useState(false);

  /*
   * The founder's shape for the multi-copy case: tapping the handshake
   * flips it in place to a minimal stepper — minus, count, plus, check —
   * and the check submits. No second screen; the tile is the form.
   */
  const [picking, setPicking] = useState(false);
  const [count, setCount] = useState(Math.max(offered ? ownQuantity : 1, 1));

  const pledge = async (quantity?: number) => {
    if (pledging) return;
    setPicking(false);
    setPledging(true);
    try {
      await onOffer(quantity);
    } finally {
      setPledging(false);
    }
  };

  const takeBack = async () => {
    if (pledging) return;
    setPicking(false);
    setPledging(true);
    try {
      await onWithdraw();
      setCount(1);
    } finally {
      setPledging(false);
    }
  };

  /*
   * Quantity drawn instead of written — and it is the *live need*, the
   * founder's confirm: copies still unpledged render as faded layers
   * behind the art, fanned out to the RIGHT. Sideways only: the first
   * cut nudged them downward, every stacked tile grew taller, and the
   * rail's names and buttons fell out of line. Three asked with one
   * pledged is a fan of two; fully pledged collapses to a single
   * dimmed card at the rail's end. Past four ×N returns. The tile
   * widens by the fan's bleed so neighbours never collide, and the
   * text stays anchored to the tile's left edge like every other.
   */
  const { remaining } = pledgeTally(flare.offers, flare.quantity);
  const visible = Math.max(remaining, 1);
  const ghosts = Math.min(visible, 4) - 1;
  const artHeight = Math.round((56 * 88) / 63);
  const fan = ghosts * 4;

  return (
    // Fully covered: dimmed AND drained of colour — "taken care of"
    // should read from across the room. (filter needs RN 0.76+ with
    // the new architecture; this project ships 0.81 with it on.)
    <View
      style={{
        width: 56 + fan,
        gap: spacing(1),
        opacity: covered ? 0.6 : 1,
        filter: covered ? [{ grayscale: 1 }] : undefined,
      }}
    >
      <View style={{ width: 56 + fan, height: artHeight }}>
        {Array.from({ length: ghosts }, (_, i) => ghosts - i).map((depth) =>
          flare.imageUrl ? (
            <Image
              key={depth}
              source={{ uri: flare.imageUrl }}
              style={[styles.stackGhost, { top: 0, left: depth * 4 }]}
            />
          ) : (
            <View key={depth} style={[styles.stackGhost, { top: 0, left: depth * 4 }]} />
          ),
        )}
        <CardImage
          imageUrl={flare.imageUrl}
          width={56}
          name={flare.cardName}
          cardNumber={flare.cardNumber}
          caption={flare.printingLabel ?? "Any printing"}
          note={flare.note}
          lookingFor={flare.quantity}
          stillNeeds={flare.offers.length > 0 ? remaining : null}
        />
        {/*
         * Every signal that used to be its own caption line lives on
         * the art as a badge now. The founder's screenshot counted the
         * handshake at three heights in one rail — variable caption
         * stacks were the culprit, so below the art the tile is a
         * fixed grid: one name line, one caption slot, one action row.
         */}
        {flare.match ? (
          <View style={styles.matchBadge}>
            <MaterialCommunityIcons
              name={flare.match === "exact" ? "check-bold" : "layers-outline"}
              size={9}
              color={colors.accent}
            />
          </View>
        ) : null}
        {flare.note ? (
          <View style={styles.noteBadge}>
            <Text style={styles.noteBadgeGlyph}>✎</Text>
          </View>
        ) : null}
        {/* The number, right on the card — the fan draws it, this chip
            says it, and both count down together as pledges land.
            Anchored from the fan's bleed so it sits on the top card. */}
        {visible > 1 ? (
          <View style={[styles.countBadge, { right: fan + 2 }]}>
            <Text style={styles.countBadgeText}>{`×${visible}`}</Text>
          </View>
        ) : null}

        {/* The stepper opens OVER the art, never in the flow: inline it
            shoved the neighbouring tiles' buttons around, which is the
            misalignment the founder photographed. */}
        {picking ? (
          <View style={styles.stepperPanel}>
            <Tap onPress={() => setPicking(false)} hitSlop={6} style={styles.stepperClose}>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>✕</Text>
            </Tap>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1) }}>
              <Tap
                onPress={() => setCount((n) => Math.max(offered ? 0 : 1, n - 1))}
                hitSlop={6}
              >
                <Text style={styles.stepperGlyph}>−</Text>
              </Tap>
              <Text style={styles.stepperCount}>{count}</Text>
              <Tap
                onPress={() =>
                  setCount((n) => Math.min(Math.max(flare.quantity, 1), n + 1))
                }
                hitSlop={6}
              >
                <Text style={styles.stepperGlyph}>+</Text>
              </Tap>
            </View>
            {/* Zero is a real answer once a pledge stands: it withdraws. */}
            <Tap
              onPress={() =>
                offered && count === 0 ? void takeBack() : void pledge(count)
              }
              hitSlop={6}
            >
              <View
                style={[styles.stepperGo, offered && count === 0 && styles.stepperGoOff]}
              >
                <Text
                  style={[
                    styles.stepperGoGlyph,
                    offered && count === 0 && { color: colors.textSecondary },
                  ]}
                >
                  {offered && count === 0 ? "Undo" : "✓"}
                </Text>
              </View>
            </Tap>
          </View>
        ) : null}

        {pledging ? (
          <View style={styles.pledgeOverlay}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        ) : null}
      </View>

      <Text numberOfLines={1} style={styles.tileName}>
        {flare.cardName}
      </Text>

      {/* The caption slot: exactly one line tall whether or not there
          is a deck to name, so the action row below never drifts. */}
      <Text numberOfLines={1} style={styles.tileCaption}>
        {flare.deckLabel ?? " "}
      </Text>

      {/* The action row: reserved on every tile. Pledging is open to
          anyone — no binder required, the founder's call — and a
          standing pledge keeps the button, filled in, tap to edit. */}
      <View style={{ height: 24 }}>
        {!mine ? (
          <Tap
            onPress={() =>
              picking
                ? setPicking(false)
                : offered || flare.quantity > 1
                  ? setPicking(true)
                  : void pledge()
            }
            disabled={pledging}
            style={[styles.pledgeButton, offered && styles.pledgeButtonOn]}
            hitSlop={4}
          >
            <MaterialCommunityIcons
              name={offered ? "handshake" : "handshake-outline"}
              size={14}
              color={offered ? colors.accent : colors.textMuted}
            />
          </Tap>
        ) : (
          <Tap onPress={onRemove} hitSlop={4} style={styles.removeButton}>
            <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600" }}>
              Remove
            </Text>
          </Tap>
        )}
      </View>
    </View>
  );
}

/** One Flare on the board: the card, your match, its offers, its actions. */
function FlareRow({
  flare,
  mine,
  storeName,
  early,
  onOffer,
  onRemove,
  onTraded,
}: {
  flare: RoomFlare;
  mine: boolean;
  storeName: string;
  /** Early board: offers read as pledges to bring the card. */
  early: boolean;
  onOffer: (message?: string, quantity?: number) => void;
  onRemove: () => void;
  onTraded: (partnerSessionId?: string) => void;
}) {
  const [offering, setOffering] = useState(false);
  const [message, setMessage] = useState("");
  const [bringing, setBringing] = useState(1);
  const pledgeLine = pledgeLineFor(flare);

  return (
    <View style={styles.flare}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing(2) }}>
        {flare.imageUrl && (
          <CardImage
            imageUrl={flare.imageUrl}
            width={40}
            name={flare.cardName}
            cardNumber={flare.cardNumber}
            caption={flare.printingLabel ?? "Any printing"}
            note={flare.note}
            lookingFor={flare.quantity}
            stillNeeds={
              flare.offers.length > 0
                ? pledgeTally(flare.offers, flare.quantity).remaining
                : null
            }
          />
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}>
            {flare.cardName}
            {flare.quantity > 1 ? ` ×${flare.quantity}` : ""}
          </Text>
          <Muted>
            {`${flare.cardNumber} · ${flare.printingLabel ?? "Any printing"}`}
          </Muted>
        </View>
        {mine && (
          <Tap onPress={onRemove} hitSlop={8}>
            <Text style={styles.removeLink}>Remove</Text>
          </Tap>
        )}
      </View>

      {flare.note && <Body>{flare.note}</Body>}

      {flare.match === "exact" && (
        <Text style={{ color: colors.accent, fontWeight: "700" }}>You have this</Text>
      )}
      {flare.match === "other-printing" && (
        <Text style={{ color: colors.accent }}>You have another printing</Text>
      )}
      {flare.counterMayHave && (
        <Muted>{`${storeName} may have this single. Ask at the counter.`}</Muted>
      )}

      {/* Coverage first, for everyone: the founder's example is Damian
          asking for 2x with one pledged — the room should read "still
          needs 1 more", not "someone's got it". */}
      {pledgeLine && (
        <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
          {pledgeLine}
        </Text>
      )}

      {flare.offers.map((offer) => (
        <View key={offer.responderSessionId} style={styles.offer}>
          <Body>
            {early
              ? `${offer.displayName ?? "A player"} is bringing ${
                  offer.quantity > 1 ? offer.quantity : "it"
                } to the event.`
              : offer.quantity > 1
                ? `${offer.displayName ?? "A player"} has ${offer.quantity} of them. Go find them.`
                : `${offer.displayName ?? "A player"} has this. Go find them.`}
            {offer.message ? ` “${offer.message}”` : ""}
            {offer.present || early ? "" : " (away right now)"}
          </Body>
          {mine && (
            <Button
              label="We traded"
              variant="secondary"
              onPress={() => onTraded(offer.responderSessionId)}
            />
          )}
        </View>
      ))}

      {mine && flare.offers.length === 0 && (
        <Tap onPress={() => onTraded(undefined)} hitSlop={8}>
          <Text style={styles.removeLink}>Traded it? Mark it done</Text>
        </Tap>
      )}

      {/* Anyone can pledge — no binder match required, the founder's
          call. The match badge above stays a hint, not a permission. */}
      {!mine && !offering && (
        <Button
          label={early ? "I got you. I'll bring it" : "Offer to trade"}
          onPress={() => setOffering(true)}
        />
      )}
      {!mine && offering && (
        <View style={{ gap: spacing(2) }}>
          {flare.quantity > 1 && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing(3),
              }}
            >
              <Muted>{early ? "How many can you bring?" : "How many do you have?"}</Muted>
              <Button
                label="−"
                variant="secondary"
                onPress={() => setBringing((n) => Math.max(1, n - 1))}
              />
              <Text
                style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "700" }}
              >
                {bringing}
              </Text>
              <Button
                label="+"
                variant="secondary"
                onPress={() => setBringing((n) => Math.min(flare.quantity, n + 1))}
              />
            </View>
          )}
          <Input
            value={message}
            onChangeText={setMessage}
            placeholder="Where to find you? (optional)"
            maxLength={80}
          />
          <Button
            label="Send the offer"
            onPress={() => {
              setOffering(false);
              onOffer(message.trim() || undefined, bringing);
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lobby: { gap: spacing(1.5) },
  person: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  dot: { width: 8, height: 8, borderRadius: 4 },
  flare: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing(3),
    gap: spacing(2),
  },
  offer: {
    backgroundColor: colors.elevated,
    borderRadius: radius.control,
    padding: spacing(3),
    gap: spacing(2),
  },
  removeLink: {
    color: colors.textMuted,
    textDecorationLine: "underline",
    fontSize: 14,
  },
  folderLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  railFade: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 28,
    height: "50%",
  },
  noteBadge: {
    position: "absolute",
    top: 2,
    // Anchored from the left so it sits on the top card of a fan, not
    // on the rightmost ghost: 56-wide card, 16-wide badge, 2px inset.
    left: 38,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  noteBadgeGlyph: {
    color: colors.accentContrast,
    fontSize: 9,
    fontWeight: "700",
  },
  pledgeOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.control / 2,
    backgroundColor: `${colors.canvas}99`,
    alignItems: "center",
    justifyContent: "center",
  },
  stackGhost: {
    position: "absolute",
    width: 56,
    // The tile's 63:88 card proportions at 56 wide.
    height: 78,
    borderRadius: radius.control / 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.canvas,
    opacity: 0.4,
  },
  // Grey means "you could", green means "you are" — the founder's
  // rule: the card carries everyone else's status, the button's
  // colour answers only whether the viewer is on this hunt.
  pledgeButton: {
    height: 24,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  pledgeButtonOn: {
    borderColor: colors.accent,
    backgroundColor: `${colors.accent}40`,
  },
  stepperGoOff: {
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  countBadge: {
    position: "absolute",
    bottom: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: `${colors.canvas}D9`,
    paddingHorizontal: 3,
  },
  countBadgeText: {
    color: colors.textPrimary,
    fontSize: 9,
    fontWeight: "700",
  },
  matchBadge: {
    position: "absolute",
    top: 2,
    left: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: `${colors.surface}E6`,
    alignItems: "center",
    justifyContent: "center",
  },
  tileName: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 14,
    minHeight: 14,
  },
  tileCaption: {
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 13,
    minHeight: 13,
  },
  removeButton: {
    height: 24,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperPanel: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 56,
    // The art's 63:88 box, covered edge to edge.
    height: 78,
    borderRadius: radius.control / 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: `${colors.canvas}F2`,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(1.5),
  },
  stepperClose: {
    position: "absolute",
    top: 1,
    right: 3,
  },
  stepperGlyph: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "700",
    width: 12,
    textAlign: "center",
  },
  stepperCount: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: "700",
    minWidth: 10,
    textAlign: "center",
  },
  stepperGo: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 4,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperGoGlyph: {
    color: colors.accentContrast,
    fontSize: 10,
    fontWeight: "700",
  },
  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: spacing(2),
    padding: spacing(3),
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
