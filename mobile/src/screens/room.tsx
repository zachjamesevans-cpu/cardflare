import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RemoteImage } from "../remote-image";

import type { StackParams } from "../../App";
import {
  ApiError,
  getTrades,
  type TradeRecord,
  confirmTrade,
  dropWant,
  forgetRoom,
  getMe,
  getRoom,
  joinRoom,
  lastRoom,
  nudgeWant,
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
  AsyncButton,
  Body,
  Button,
  Card,
  CardImage,
  type ZoomCard,
  ErrorLine,
  Input,
  Muted,
  Tap,
  Title,
} from "../ui";
import { inRailOrder } from "../rail-order";
import { RoomTimersCard } from "../room-timers";
import { OpenToTradesTag } from "../open-to-trades-tag";
import { TournamentHelpModal } from "../tournament-help";
import { PlayerAvatar } from "../player-avatar";
import { PlayerPeekModal } from "../player-peek";
import { colors, radius, spacing } from "../theme";
import { WantRow } from "../want-row";

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
  /* What is being typed, for the player whose camera will not focus. */
  const [typed, setTyped] = useState("");
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();

  useFocusEffect(
    useCallback(() => {
      void lastRoom().then(setCode);
    }, []),
  );

  if (!code) {
    return (
      <View style={{ padding: spacing(4) }}>
        {/*
         * Getting INTO a room happens here now, not on the Feed. The
         * founder: "move the qr code scanner/code entry to Room. No need
         * to have that in the feed." Both ways in are on this card,
         * because typing is a first-class route and not a consolation —
         * a meaningful share of players have a camera that will not
         * focus, a locked-down work phone or a cracked screen.
         */}
        <Card>
          <Title>No room yet</Title>
          <Body>
            Scan the code at your store&rsquo;s counter, or type it here. Either way
            cardflare reopens the room where you left it.
          </Body>

          <Button label="Scan a QR code" onPress={() => navigation.navigate("Scan")} />

          <View style={{ flexDirection: "row", gap: spacing(2) }}>
            <View style={{ flex: 1 }}>
              <Input
                value={typed}
                onChangeText={setTyped}
                placeholder="Or enter the code"
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>
            <AsyncButton
              label="Go"
              pendingLabel="Opening…"
              variant="secondary"
              onPress={async () => {
                const entered = typed.trim().toUpperCase();
                if (!entered) return;
                await rememberRoom(entered);
                setTyped("");
                setCode(entered);
              }}
            />
          </View>
        </Card>
      </View>
    );
  }

  return (
    <RoomScreen
      code={code}
      onSwitch={setCode}
      onForget={() => {
        void forgetRoom();
        setCode(null);
      }}
    />
  );
}

function RoomScreen({
  code,
  onSwitch,
  onForget,
}: {
  code: string;
  /** Jump this tab to another room — how an early board is stepped into. */
  onSwitch: (code: string) => void;
  /** Drop the remembered code and go back to the way in. */
  onForget: () => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<RoomState | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* The room answered "no such code", as opposed to not answering. */
  const [dead, setDead] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /* The first-tournament guide, folded behind its link. */
  const [tournamentHelp, setTournamentHelp] = useState(false);
  const [wants, setWants] = useState<Me["wants"]>([]);

  /*
   * The join resumed a seat this account already had. Kept for the visit
   * rather than the session: it answers "did my tap do anything", and once
   * the player is reading the board the answer has been given.
   */
  const [resumed, setResumed] = useState(false);

  /*
   * The re-post panel starts folded, and that IS the "no thanks": the
   * founder cut the old "Never mind" button once the closed tile became
   * a single quiet line. The wants stay saved either way.
   */
  const [repostOpen, setRepostOpen] = useState(false);

  /*
   * Posting a saved hunt walks the whole list one card at a time, which
   * on a room's connection is seconds of nothing. The founder's report:
   * "it kinda just stalls there... people don't feel they have to click
   * it multiple times." The button counts them off as they land.
   */
  const [repostDone, setRepostDone] = useState<number | null>(null);

  /*
   * The roster folds shut by default — the founder's call: ten names
   * above the board pushed the product below the fold, and the counts
   * are what a scanning eye needs. LayoutAnimation makes the unfold
   * slide instead of snap.
   */
  const [rosterOpen, setRosterOpen] = useState(false);

  /*
   * The founder's synthesis, replacing the stacked/carousel toggle: the
   * rail is every player's default face, and the chevron on a player's
   * header unfolds THEM into the full stacked view — the same gesture
   * the roster taught. Detail is a per-person question, not a mode.
   */
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  /*
   * Which player's rail has nothing further to scroll, so the trailing
   * fade can get out of the way. The two widths live in refs rather
   * than state because they are inputs to that decision, not something
   * the screen renders — writing them through state would re-render the
   * whole board on every layout pass.
   */
  const [railsAtEnd, setRailsAtEnd] = useState<Record<string, boolean>>({});
  const railContent = useRef<Record<string, number>>({});
  const railLayout = useRef<Record<string, number>>({});

  const inFlight = useRef(false);

  /* The viewer's own trades tonight, the web's private list. */
  const [trades, setTrades] = useState<TradeRecord[]>([]);

  /* The profile popup: which account is being looked at, or null.
     Declared HERE, above every early return - a hook that first runs
     only after the room loads is a hook React counts as new, and the
     screen dies at exactly the moment a room comes up. */
  const [peek, setPeek] = useState<string | null>(null);

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

      if (fresh.joined) {
        try {
          setTrades((await getTrades(code)).trades);
        } catch {
          /* The list is garnish; the room must not fail over it. */
        }
      }
    } catch (caught) {
      const missing = caught instanceof ApiError && caught.status === 404;
      setDead(missing);
      setError(
        missing
          ? "That code does not point at a room."
          : "Could not reach the room. Check your connection and pull to retry.",
      );
    } finally {
      inFlight.current = false;
    }
  }, [code]);

  useEffect(() => {
    setState(null);
    setRepostOpen(false);
    setResumed(false);
    setExpandedGroups({});
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await joinRoom(code, name.trim() || undefined);
      /*
       * The account was already in here from the website or an earlier
       * install, and this tap picked that seat up. Said out loud because
       * silence is what the duplicate looked like: two of you on the board
       * and no sign anything had gone wrong.
       */
      setResumed(Boolean(result.resumed));
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
      <View style={{ padding: spacing(4) }}>
        <Card>
          {error ? <Title>No room on that code</Title> : null}
          <ErrorLine message={error} />
          {!error && <Muted>Loading the room…</Muted>}
          {error && (
            <AsyncButton
              label="Try again"
              pendingLabel="Retrying…"
              onPress={() => refresh()}
            />
          )}
          {/*
           * A typo used to be permanent: the code is remembered before
           * the room answers, so a dead one reopened this same screen
           * every visit and Try again only asked it again. This is the
           * way back to the field — offered only when the room is
           * genuinely not there, because forgetting a good code over a
           * dropped connection would be the worse mistake.
           */}
          {dead && (
            <Button
              label="Use a different code"
              variant="secondary"
              onPress={onForget}
            />
          )}
        </Card>
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
            Trading is open here. Pick a name and you&rsquo;re in; the room opens with
            you.
          </Body>
          <ErrorLine message={error} />
          {state.account ? (
            <JoiningAs name={state.account.displayName} />
          ) : (
            <Input
              value={name}
              onChangeText={setName}
              placeholder="Display name"
              autoCapitalize="words"
            />
          )}
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
            <AsyncButton
              label="Open the early board"
              pendingLabel="Opening…"
              onPress={async () => {
                const early = state.earlyBoard;
                if (!early) return;
                await rememberRoom(early.code);
                onSwitch(early.code);
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
            <AsyncButton
              label="Open the early board"
              pendingLabel="Opening…"
              onPress={async () => {
                const early = state.earlyBoard;
                if (!early) return;
                await rememberRoom(early.code);
                onSwitch(early.code);
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
              <Body>
                {state.account
                  ? "You are signed in, so the room will know you."
                  : "Pick a name people in the room will recognise."}
              </Body>
              <ErrorLine message={error} />
              {state.account ? (
                <JoiningAs name={state.account.displayName} />
              ) : (
                <Input
                  value={name}
                  onChangeText={setName}
                  placeholder="Display name"
                  autoCapitalize="words"
                />
              )}
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

  /* The account behind each session, for tapping a board header. */
  const playerBySession = new Map(
    participants.map((p) => [p.playerSessionId, p.playerId ?? null]),
  );
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

  /*
   * Which rails have nothing further to scroll, keyed by player.
   *
   * Measured rather than assumed, the same rule the website uses: a
   * rail that was never long enough to scroll, or has been scrolled to
   * its end, drops the trailing fade instead of going on promising
   * cards that are not there.
   */
  const setRailEnd = (sessionId: string, atEnd: boolean) =>
    setRailsAtEnd((current) =>
      current[sessionId] === atEnd ? current : { ...current, [sessionId]: atEnd },
    );

  /*
   * A rail is at its end when there is no room left, or when the offset
   * has reached it. One point of tolerance, because fractional layout
   * means the offset rarely lands exactly on the maximum, and a fade
   * surviving at 0.4px left is the bug this fixes.
   *
   * Both halves matter: `onScroll` covers reaching the end, and the
   * content-and-layout pair covers a rail that was never long enough to
   * scroll at all, which never fires a scroll event.
   */
  const railMeasure = (
    sessionId: string,
    content: number,
    layout: number,
    offset: number,
  ) => {
    const room = content - layout;
    setRailEnd(sessionId, room <= 1 || offset >= room - 1);
  };

  /* Being open to trades is a fact about the person, so the board says
     it on their name rather than as a card in their rail. */
  const openIds = new Set(
    participants.filter((p) => p.openToTrades).map((p) => p.playerSessionId),
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
        contentContainerStyle={{
          padding: spacing(4),
          gap: spacing(3),
          paddingBottom: spacing(24) + insets.bottom,
        }}
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
          {/* The room's pulse on the door card, the founder's reorder:
              the two numbers a glance wants first. "You're in as" is
              gone — your own board section already says "you". */}
          <Muted>
            {`${participants.filter((p) => p.present).length} here now · ${flares.length} ${
              flares.length === 1 ? "Flare" : "Flares"
            }`}
          </Muted>
          {/* For the person deciding whether to sit down next week —
              the same guide the website links from its event page. */}
          <Tap onPress={() => setTournamentHelp(true)} hitSlop={6}>
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}>
              New to tournaments? Here&rsquo;s how a night works &rarr;
            </Text>
          </Tap>
        </Card>

        <TournamentHelpModal
          open={tournamentHelp}
          onClose={() => setTournamentHelp(false)}
        />

        {/* The wall's clocks, for a seat that cannot see the wall — or
            somebody who stepped out with the room in their pocket. */}
        <RoomTimersCard timers={state.timers} />

        {/* The same words the website uses, for the same moment. */}
        {resumed && (
          <Card>
            <Title>You were already in this room</Title>
            <Body>
              Same seat, same Flares, same binder. Your account is one player here
              however you got in, so nothing was posted twice.
            </Body>
          </Card>
        )}

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

        {/*
         * Closed, this tile is exactly the roster's silhouette: one
         * header line, nothing under it. The Post button lives inside
         * the fold with the list it posts, and "Never mind" is gone —
         * the founder's call: a tile that starts closed does not need a
         * second way to be ignored.
         */}
        {outstanding.length > 0 && (
          <Card>
            <Tap
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setRepostOpen((current) => !current);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing(2),
              }}
            >
              <Title>Still hunting these?</Title>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing(1.5),
                }}
              >
                <Muted>
                  {`${outstanding.length} ${outstanding.length === 1 ? "card" : "cards"}`}
                </Muted>
                <MaterialCommunityIcons
                  name={repostOpen ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={colors.textMuted}
                />
              </View>
            </Tap>

            {/* Open, the panel is the stacked board in miniature — art,
                name, number, printing — plus the two controls the board
                has no business carrying: how many of a *saved* ask, and
                dropping it for good. */}
            {repostOpen && (
              <View style={{ gap: spacing(2) }}>
                <View>
                  {outstanding.map((want) => (
                    <WantRow
                      key={want.id}
                      want={want}
                      onNudge={(delta) => act(() => nudgeWant(want.id, delta))}
                      onDrop={() => act(() => dropWant(want.id))}
                    />
                  ))}
                </View>
                <Button
                  busy={repostDone !== null}
                  label={
                    repostDone === null
                      ? `Post ${outstanding.length === 1 ? "it" : `all ${outstanding.length}`} to this room`
                      : outstanding.length === 1
                        ? "Posting…"
                        : `Posting… ${repostDone} of ${outstanding.length}`
                  }
                  onPress={() => {
                    if (repostDone !== null) return;
                    setRepostDone(0);
                    void act(async () => {
                      let done = 0;
                      for (const want of outstanding) {
                        await postFlare(code, {
                          cardId: want.cardId,
                          printingId: want.printingId,
                          quantity: want.quantity,
                          note: want.note ?? undefined,
                          deckLabel: want.deckLabel,
                        }).catch(() => {});
                        done += 1;
                        setRepostDone(done);
                      }
                    }).finally(() => setRepostDone(null));
                  }}
                />
              </View>
            )}
          </Card>
        )}

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
          /*
           * Cards pointing the other way come out first and stay out.
           * A showcase is "I have this", the opposite statement to a
           * Flare, and reading the two as one list is how somebody
           * walks over about a card the owner was trying to move.
           */
          const showcases = group.flares.filter((f) => f.intent === "showcase");
          const wants = group.flares.filter((f) => f.intent !== "showcase");
          const { folders, loose } = partitionByDeck(wants);

          /* Headings only when both directions are in play; labelling a
             lone hunt "Looking for" is furniture. */
          const labelled = showcases.length > 0;

          /* One answer for the whole rail, so tiles beside each other
             still agree on where their buttons sit. */
          const railHasDecks = group.flares.some((f) => Boolean(f.deckLabel));

          const tile = (flare: RoomFlare) => {
            const own = flare.offers.find((o) => o.responderSessionId === youId);

            return (
              <CarouselFlare
                key={flare.id}
                flare={flare}
                mine={mine}
                reserveCaption={railHasDecks}
                siblings={shelf}
                position={shelfAt.get(flare.id) ?? 0}
                offered={Boolean(own)}
                ownQuantity={own?.quantity ?? 1}
                early={room.early}
                onOffer={(quantity) =>
                  act(() => offerOnFlare(code, flare.id, undefined, quantity))
                }
                onWithdraw={() => act(() => withdrawOffer(code, flare.id))}
                onRemove={() => act(() => removeFlare(code, flare.id))}
              />
            );
          };

          /* Fully pledged hunts park at the rail's far end, dimmed but
             present — the bring-extras crowd can still see the ask. */
          const isCovered = (flare: RoomFlare) =>
            flare.offers.length > 0 &&
            pledgeTally(flare.offers, flare.quantity).remaining === 0;

          /*
           * Cards you can answer come first — the website's rule, word for
           * word: "all cards you have will automatically sort to the
           * leftmost portion of the carousel." A rail you can only read the
           * front of should open on the part that concerns you, and the
           * ring then says which without a sentence.
           *
           * Covered hunts still park at the far end whatever else is true:
           * those are settled, and settled outranks interesting.
           */
          const held = (flare: RoomFlare) => Boolean(flare.match);

          const railFlares = [...folders.flatMap((f) => f.flares), ...loose];
          const orderedRail = inRailOrder(railFlares, held, isCovered);

          /*
           * The rail as one shelf, in the order it is drawn, so swiping
           * goes the way the eye already went. The website's rule and the
           * website's shape.
           */
          const shelf: ZoomCard[] = orderedRail.map((f) => ({
            imageUrl: f.imageUrl,
            name: f.cardName,
            cardNumber: f.cardNumber,
            caption: f.printingLabel ?? "Any printing",
            note: f.note,
            lookingFor: f.quantity,
            direction: f.intent,
            stillNeeds:
              f.offers.length > 0 ? pledgeTally(f.offers, f.quantity).remaining : null,
            pledges: f.offers.map((offer) => ({
              name: offer.displayName ?? "A player",
              quantity: offer.quantity,
            })),
            youHave: f.match ? { kind: f.match, count: f.heldCount ?? 0 } : null,
          }));
          const shelfAt = new Map(orderedRail.map((f, index) => [f.id, index]));

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
                onRemove={() => act(() => removeFlare(code, flare.id))}
                onTraded={(partner) =>
                  void act(() => confirmTrade(code, flare.id, partner))
                }
              />
            ));

          const groupOpen = Boolean(expandedGroups[sessionId]);

          return (
            <Card key={sessionId}>
              {/*
               * The founder's synthesis, replacing the page-wide toggle:
               * the rail is every player's default face, and the chevron
               * on their header unfolds THEM into the full stacked view —
               * the same gesture the roster taught.
               */}
              <Tap
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setExpandedGroups((current) => ({
                    ...current,
                    [sessionId]: !current[sessionId],
                  }));
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: spacing(2),
                  /* The website's hairline, for the same reason: the
                     person and their cards used to run together as one
                     block of things at slightly different sizes. */
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  paddingBottom: spacing(3),
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing(1.5),
                    flexShrink: 1,
                    flexGrow: 1,
                  }}
                >
                  {/* An account's identity opens their popup; the rest
                      of the header still folds the section. Same split
                      as the website's board header. */}
                  {(() => {
                    const person = participants.find(
                      (p) => p.playerSessionId === sessionId,
                    );
                    const identity = (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: spacing(2),
                          flexShrink: 1,
                        }}
                      >
                        <PlayerAvatar
                          displayName={group.name ?? "A player"}
                          seed={sessionId}
                          avatarUrl={person?.avatarUrl ?? null}
                          frame={person?.frame ?? null}
                          ring={person?.ring ?? null}
                          aura={person?.aura ?? null}
                          ringArt={person?.ringArt ?? null}
                          auraArt={person?.auraArt ?? null}
                          /* 64, matching the website's `lg`. The
                             founder's mockup settles what this row is:
                             the picture anchors it, and a worn ring is
                             most of why anybody bought one. */
                          size={64}
                        />
                        {/*
                         * The name and the line under it are a COLUMN
                         * beside the picture, never items wrapped around
                         * it. Placed after the picture-and-name pair, the
                         * tag lands beneath the PICTURE and reads as a
                         * caption on the avatar — the same bug the
                         * website had, reported three times.
                         */}
                        <View style={{ flexShrink: 1, gap: spacing(1) }}>
                          <Title>{group.name ?? "A player"}</Title>
                          {openIds.has(sessionId) && <OpenToTradesTag />}
                        </View>
                      </View>
                    );
                    return playerBySession.get(sessionId) ? (
                      <Tap onPress={() => setPeek(playerBySession.get(sessionId)!)}>
                        {identity}
                      </Tap>
                    ) : (
                      identity
                    );
                  })()}
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing(1.5),
                  }}
                >
                  <Muted>
                    {`${group.flares.length} ${group.flares.length === 1 ? "card" : "cards"}`}
                  </Muted>
                  <MaterialCommunityIcons
                    name={groupOpen ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={colors.textMuted}
                  />
                </View>
              </Tap>

              {!groupOpen ? (
                <View>
                  {/* One rail, wants first: the founder's revision.
                      Nearly all of a board is wants, so a labelled
                      shelf for one showcase cluttered every section
                      that had one. Cards on offer sit past the divider
                      at the far end, same as the website. */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    scrollEventThrottle={16}
                    onScroll={(event) =>
                      railMeasure(
                        sessionId,
                        event.nativeEvent.contentSize.width,
                        event.nativeEvent.layoutMeasurement.width,
                        event.nativeEvent.contentOffset.x,
                      )
                    }
                    onLayout={(event) => {
                      railLayout.current[sessionId] = event.nativeEvent.layout.width;
                      const content = railContent.current[sessionId];
                      if (content != null) {
                        railMeasure(
                          sessionId,
                          content,
                          event.nativeEvent.layout.width,
                          0,
                        );
                      }
                    }}
                    onContentSizeChange={(width) => {
                      railContent.current[sessionId] = width;
                      const layout = railLayout.current[sessionId];
                      if (layout != null) railMeasure(sessionId, width, layout, 0);
                    }}
                    /*
                     * Pulled back by exactly the padding below, so the
                     * first card's edge lands on the same line as the
                     * header above it. The padding itself is for the ring
                     * on a card you are holding: a ScrollView clips what
                     * leaves its bounds, and the ring sits two pixels
                     * outside the art with a glow past that. The website
                     * had this bug and this fix.
                     */
                    style={{ marginHorizontal: -spacing(2) }}
                    contentContainerStyle={{
                      gap: spacing(2),
                      paddingHorizontal: spacing(2),
                      paddingVertical: spacing(2),
                      alignItems: "flex-start",
                    }}
                  >
                    {orderedRail.map(tile)}
                    {labelled && (
                      <>
                        <View
                          style={{
                            width: 1,
                            alignSelf: "stretch",
                            backgroundColor: colors.border,
                            marginHorizontal: spacing(0.5),
                          }}
                        />
                        {showcases.map(tile)}
                      </>
                    )}
                  </ScrollView>
                  {/*
                   * The edge fades so the rail visibly continues instead
                   * of the last card looking cut off — and stops fading
                   * once there is nothing left to continue to, which is
                   * the founder's correction: a fade that never leaves
                   * keeps promising cards that are not there.
                   */}
                  {!railsAtEnd[sessionId] && (
                    <LinearGradient
                      pointerEvents="none"
                      colors={[`${colors.surface}00`, colors.surface]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.railFade}
                    />
                  )}
                </View>
              ) : (
                <>
                  {labelled && (
                    <View style={{ gap: spacing(1) }}>
                      <Text style={styles.folderLabel}>
                        {`Letting go · ${showcases.length} ${
                          showcases.length === 1 ? "card" : "cards"
                        }`}
                      </Text>
                      <View>{rows(showcases)}</View>
                    </View>
                  )}

                  {labelled && wants.length > 0 && (
                    <Text style={styles.folderLabel}>
                      {`Looking for · ${wants.length} ${
                        wants.length === 1 ? "card" : "cards"
                      }`}
                    </Text>
                  )}

                  {folders.map((folder) => (
                    <View key={folder.label.toLowerCase()} style={{ gap: spacing(1) }}>
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

        {/* The lobby, parked at the foot of the page: the names are
            reference material, and their counts now live on the door
            card at the top. Same fold, same chevron, further down. */}
        {trades.length > 0 && (
          <Card>
            <Title>Traded tonight</Title>
            <Body>
              Only you can see this list. The store sees tonight's totals, never who
              traded what.
            </Body>
            <View>
              {trades.map((trade) => (
                <View
                  key={trade.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: spacing(1.5),
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    paddingVertical: spacing(2),
                  }}
                >
                  <MaterialCommunityIcons
                    name="check-circle-outline"
                    size={15}
                    color={colors.accent}
                  />
                  <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>
                    {trade.cardName}
                  </Text>
                  {trade.quantity > 1 && (
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                      {`×${trade.quantity}`}
                    </Text>
                  )}
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    {trade.youWere === "requester"
                      ? trade.partnerName
                        ? `from ${trade.partnerName}`
                        : "found in the room"
                      : `to ${trade.partnerName ?? "a player"}`}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        )}

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
                .map((p) => {
                  const row = (
                    <>
                      {/* The picture and the border they bought, so a
                          thing earned is worn where the people are. */}
                      <PlayerAvatar
                        displayName={p.displayName ?? "A player"}
                        seed={p.playerSessionId}
                        avatarUrl={p.avatarUrl ?? null}
                        frame={p.frame ?? null}
                        ring={p.ring ?? null}
                        aura={p.aura ?? null}
                        ringArt={p.ringArt ?? null}
                        auraArt={p.auraArt ?? null}
                        dimmed={!p.present}
                      />
                      <Text
                        style={{
                          color: p.present ? colors.textPrimary : colors.textSecondary,
                          flexShrink: 1,
                        }}
                        numberOfLines={1}
                      >
                        {p.displayName ?? "A player"}
                      </Text>
                      {p.openToTrades && <OpenToTradesTag />}
                      {!p.present && (
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                          away
                        </Text>
                      )}
                    </>
                  );

                  /*
                   * An account opens the profile popup right here, the
                   * website's behaviour. A guest is not a dead button,
                   * they are somebody who does not need an account to
                   * trade, so their row stays plain.
                   */
                  return p.playerId ? (
                    <Tap
                      key={p.playerSessionId}
                      onPress={() => setPeek(p.playerId!)}
                      style={styles.person}
                    >
                      {row}
                    </Tap>
                  ) : (
                    <View key={p.playerSessionId} style={styles.person}>
                      {row}
                    </View>
                  );
                })}
            </View>
          )}
        </Card>
      </ScrollView>

      <PlayerPeekModal
        playerId={peek}
        onClose={() => setPeek(null)}
        onViewProfile={(playerId) => {
          setPeek(null);
          navigation.navigate("PlayerProfile", { playerId });
        }}
      />

      {/* The action bar: the two things a thumb reaches for in a room.
          Its own padding plus the home indicator's strip, so the buttons
          stop above the swipe area rather than sitting inside it. */}
      <View style={[styles.actionBar, { paddingBottom: spacing(3) + insets.bottom }]}>
        <View style={{ flex: 1 }}>
          <Button
            label="Post a Flare"
            onPress={() => navigation.navigate("PostFlare", { code })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <AsyncButton
            label={youOpen ? "Open to trades ✓" : "I'm open to trades"}
            pendingLabel={youOpen ? "Closing…" : "Opening…"}
            variant="secondary"
            onPress={() => act(() => setOpenToTrades(code, !youOpen))}
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

/** What an unlabelled batch is called. Mirrors the website's own. */
const UNNAMED_BATCH = "Posted together";

/** The website's partition, in miniature: folders merge case-insensitively
    and keep the spelling of the first card seen; order follows the board. */
/**
 * What the poster will take, as the board says it.
 *
 * Mirrors `acceptsLabel` in src/lib/lists/schema.ts. Trade-only stays
 * silent: it is what cardflare has always meant, and a badge on every
 * row is furniture rather than information.
 */
function acceptsLabel(flare: {
  acceptsTrade: boolean;
  acceptsCash: boolean;
}): string | null {
  if (flare.acceptsTrade && flare.acceptsCash) return "Trade or cash";
  if (flare.acceptsCash) return "Cash only";
  return null;
}

function partitionByDeck(flares: RoomFlare[]): {
  folders: { label: string; flares: RoomFlare[] }[];
  loose: RoomFlare[];
} {
  const folders = new Map<string, { label: string; flares: RoomFlare[] }>();
  const loose: RoomFlare[] = [];

  for (const flare of flares) {
    const label = flare.deckLabel?.trim();
    const batch = flare.postedBatch ?? null;

    /* Neither a name nor a batch: a card posted on its own. */
    if (!label && !batch) {
      loose.push(flare);
      continue;
    }

    /*
     * A batch with no label is still a batch. Grouping only by the
     * label meant a pasted list nobody named came out as thirty loose
     * rows, which is the pile the grouping exists to prevent.
     */
    const key = label ? `label:${label.toLowerCase()}` : `batch:${batch}`;
    const existing = folders.get(key);

    if (existing) {
      existing.flares.push(flare);
      continue;
    }

    folders.set(key, { label: label ?? UNNAMED_BATCH, flares: [flare] });
  }

  /* A batch of one is a card, not a folder containing one thing. */
  const kept: { label: string; flares: RoomFlare[] }[] = [];

  for (const folder of folders.values()) {
    if (folder.label === UNNAMED_BATCH && folder.flares.length === 1) {
      loose.push(folder.flares[0]);
      continue;
    }
    kept.push(folder);
  }

  return { folders: kept, loose };
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
  reserveCaption,
  siblings,
  position,
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
  /**
   * Hold a line open under the name for a deck label.
   *
   * Decided for the whole rail, not per card - the website's rule, and
   * the same reason: the line exists so the action row sits at one
   * height across tiles standing side by side, and when nobody in a rail
   * has named a deck there is no drift to prevent, only an empty row
   * between the names and the buttons.
   */
  reserveCaption: boolean;
  /** The rest of this player's rail, so the viewer can walk it. */
  siblings: ZoomCard[];
  position: number;
  onOffer: (quantity?: number) => Promise<void>;
  onWithdraw: () => Promise<void>;
  onRemove: () => Promise<void>;
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
   * Same complaint, the other side of the trade: Remove sat there
   * looking untouched until the next poll repainted the board. Now the
   * whole tile greys out under a spinner the moment it is tapped, so
   * the tap is visibly taken. Whole tile, not just the art — the card
   * is the thing going away.
   */
  const [removing, setRemoving] = useState(false);

  const remove = async () => {
    if (removing) return;
    setRemoving(true);
    try {
      await onRemove();
    } finally {
      /* The board usually repaints this tile out of existence first;
         this is for the case where the write failed and it stays. */
      setRemoving(false);
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
    // Two layers on purpose: the dimming lives on the inner view so the
    // spinner above it keeps its colour and full strength. Grey the
    // whole tile including the spinner and the feedback disappears into
    // the thing it is meant to be feedback about.
    <View style={{ width: 56 + fan }}>
      {/* Fully covered: dimmed AND drained of colour — "taken care of"
          should read from across the room. (filter needs RN 0.76+ with
          the new architecture; this project ships 0.81 with it on.) */}
      <View
        style={{
          gap: spacing(1),
          opacity: covered ? 0.6 : 1,
          filter: covered ? [{ grayscale: 1 }] : undefined,
        }}
      >
        {/* Being removed greys the card and nothing else — the founder's
            correction. Dimming the tile took the name and the button
            with it, which said "this row is disabled" rather than "this
            card is on its way out". */}
        <View
          style={{
            width: 56 + fan,
            height: artHeight,
            opacity: removing ? 0.6 : 1,
            filter: removing ? [{ grayscale: 1 }] : undefined,
          }}
        >
          {/*
           * A ring on a card you are holding — the website's mark, and the
           * founder's replacement for the old "you have 2 of 6" count: a
           * ring on the card IS the finding, and it survives being glanced
           * at across a table in a way a sentence does not.
           *
           * An overlay rather than a border on the wrapper, because in
           * React Native a border takes its width out of the box it is on;
           * the card would shrink by two pixels the moment you happened to
           * own it. Outset by two so it sits around the art, not on it.
           */}
          {flare.match ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: -2,
                top: -2,
                right: -2,
                bottom: -2,
                borderWidth: 2,
                borderColor: colors.accent,
                /*
                 * The art's own radius plus the two pixels this sits
                 * outset by, so the ring's INNER curve lands exactly on
                 * the picture's edge. `radius.control + 2` was a curve
                 * twice as round as the card it was ringing, and the
                 * corners showed the daylight between them.
                 */
                borderRadius: radius.control / 2 + 2,
                shadowColor: colors.accent,
                shadowOpacity: 0.35,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 0 },
                zIndex: 5,
              }}
            />
          ) : null}
          {Array.from({ length: ghosts }, (_, i) => ghosts - i).map((depth) =>
            flare.imageUrl ? (
              <RemoteImage
                key={depth}
                uri={flare.imageUrl}
                style={[styles.stackGhost, { left: depth * 4 }]}
              />
            ) : (
              <View key={depth} style={[styles.stackGhost, { left: depth * 4 }]} />
            ),
          )}
          {/* The same two icons the website puts in the same corner, for
              the same two facts. Which printing you hold is worth a glance
              of its own: "you have it" and "you have a different version"
              are not the same walk across a room. */}
          {flare.match ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 2,
                left: 2,
                zIndex: 6,
                borderRadius: 999,
                backgroundColor: colors.surface,
                padding: 1,
              }}
            >
              <MaterialCommunityIcons
                name={
                  flare.match === "exact"
                    ? "package-variant-closed-check"
                    : "layers-outline"
                }
                size={12}
                color={colors.accent}
              />
            </View>
          ) : null}
          <CardImage
            imageUrl={flare.imageUrl}
            width={56}
            name={flare.cardName}
            cardNumber={flare.cardNumber}
            caption={flare.printingLabel ?? "Any printing"}
            note={flare.note}
            lookingFor={flare.quantity}
            direction={flare.intent}
            stillNeeds={flare.offers.length > 0 ? remaining : null}
            pledges={flare.offers.map((offer) => ({
              name: offer.displayName ?? "A player",
              quantity: offer.quantity,
            }))}
            youHave={
              flare.match ? { kind: flare.match, count: flare.heldCount ?? 0 } : null
            }
            siblings={siblings}
            position={position}
            terms={acceptsLabel(flare)}
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
              <Tap
                onPress={() => setPicking(false)}
                hitSlop={6}
                style={styles.stepperClose}
              >
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>✕</Text>
              </Tap>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: spacing(1) }}
              >
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
                  style={[
                    styles.stepperGo,
                    offered && count === 0 && styles.stepperGoOff,
                  ]}
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

        {/* The caption slot: one line tall whether or not THIS card has a
            deck to name, so the action row never drifts across a rail.
            Reserved per rail, so a board where nobody named a deck - very
            nearly every board - has no empty row in it. */}
        {reserveCaption && (
          <Text numberOfLines={1} style={styles.tileCaption}>
            {flare.deckLabel ?? " "}
          </Text>
        )}

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
            <Tap
              onPress={() => void remove()}
              disabled={removing}
              hitSlop={4}
              style={styles.removeButton}
            >
              <Text
                style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600" }}
              >
                Remove
              </Text>
            </Tap>
          )}
        </View>
      </View>

      {/* Over the front card only, not the fan: "dead centre of the
          card" means the card you are looking at. A sibling of the
          greyed art rather than a child, so the spinner keeps its
          colour while everything under it loses its own. */}
      {removing ? (
        <View style={[styles.removeOverlay, { width: 56, height: artHeight }]}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      ) : null}
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
  onRemove: () => Promise<void>;
  onTraded: (partnerSessionId?: string) => void;
}) {
  const [offering, setOffering] = useState(false);
  const [message, setMessage] = useState("");
  const [bringing, setBringing] = useState(1);
  const pledgeLine = pledgeLineFor(flare);

  /* Same acknowledgement as the carousel tile: the row greys out under
     a spinner the moment Remove is tapped. */
  const [removing, setRemoving] = useState(false);

  const remove = async () => {
    if (removing) return;
    setRemoving(true);
    try {
      await onRemove();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <View>
      <View
        style={[styles.flare, removing && { opacity: 0.6, filter: [{ grayscale: 1 }] }]}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            gap: spacing(2),
          }}
        >
          {flare.imageUrl && (
            <CardImage
              imageUrl={flare.imageUrl}
              width={40}
              name={flare.cardName}
              cardNumber={flare.cardNumber}
              caption={flare.printingLabel ?? "Any printing"}
              note={flare.note}
              lookingFor={flare.quantity}
              direction={flare.intent}
              stillNeeds={
                flare.offers.length > 0
                  ? pledgeTally(flare.offers, flare.quantity).remaining
                  : null
              }
              youHave={
                flare.match ? { kind: flare.match, count: flare.heldCount ?? 0 } : null
              }
            />
          )}
          <View style={{ flex: 1 }}>
            <Text
              style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}
            >
              {flare.cardName}
              {flare.quantity > 1 ? ` ×${flare.quantity}` : ""}
            </Text>
            <Muted>
              {`${flare.cardNumber} · ${flare.printingLabel ?? "Any printing"}`}
            </Muted>
          </View>
          {mine && (
            <Tap onPress={() => void remove()} disabled={removing} hitSlop={8}>
              <Text style={styles.removeLink}>Remove</Text>
            </Tap>
          )}
        </View>

        {flare.note && <Body>{flare.note}</Body>}

        {/* Direction is said once by the heading above this row, so
            what is left worth saying per card is the terms, and only
            when they are not the plain trade the board assumes. */}
        {acceptsLabel(flare) && (
          <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
            {acceptsLabel(flare)}
          </Text>
        )}

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
                <Muted>
                  {early ? "How many can you bring?" : "How many do you have?"}
                </Muted>
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

      {/* The stacked row dims whole: here the row is the entry, not a
          picture with a caption under it. */}
      {removing ? (
        <View style={[styles.removeOverlay, { right: 0, bottom: 0 }]}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      ) : null}
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
    // Pinned to the bottom, not the top: the founder's rule is that a
    // stack's cards share a baseline, whatever their height.
    bottom: 0,
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
  // The card, and only the card. Sized by the caller, because the
  // carousel tile wants the art's box and the stacked row wants its own.
  removeOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
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

/**
 * Who a signed-in player is joining as.
 *
 * Not an input, deliberately. The founder's report was that signing in
 * still dropped them into a room as a guest under whatever the form had;
 * an account's name is unique and belongs to the account, so a room is
 * not the place to change it. Profile settings is.
 */
function JoiningAs({ name }: { name: string }) {
  return (
    <View
      style={{
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.elevated,
        padding: spacing(3),
        gap: spacing(1),
      }}
    >
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>Joining as</Text>
      <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: "700" }}>
        {name}
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
        Your name, picture and Embers come with you. Change your name on the Profile
        tab.
      </Text>
    </View>
  );
}
