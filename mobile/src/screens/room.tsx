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
import { DoorIconButton, RemoteEntry } from "../remote-entry";
import { dedupeParticipants } from "../room-people";
import { UndoToast, type UndoOffer } from "../undo-toast";

import type { StackParams } from "../../App";
import {
  ApiError,
  getTrades,
  type TradeRecord,
  acknowledgeTrade,
  confirmTrade,
  forgetRoom,
  getMe,
  getNightMatches,
  getRoom,
  goingOf,
  joinRoom,
  storedSessionToken,
  lastRoom,
  offerOnFlare,
  postFlare,
  withdrawOffer,
  rememberRoom,
  removeFlare,
  removeLocal,
  restoreRoomFlares,
  roomPhaseOf,
  setOpenToTrades,
  storedAccessToken,
  takeDownRoomFlare,
  type Me,
  type NightMatches,
  type RoomFlare,
  type RoomPhase,
  type RoomState,
  type RosterPlayer,
} from "../api";
import { EarlyBanner } from "../early-banner";
import { EventDetails } from "../event-details";
import { FAB_HEIGHT, FlareFab } from "../flare-fab";
import {
  FlareFilterRow,
  emptyFilterLine,
  filterFlares,
  type FlareFilter,
} from "../flares-at-night";
import { MatchesForYou } from "../matches-for-you";
import { FLARES_AT_THIS_NIGHT } from "../night-copy";
import { NightHeader } from "../night-header";
import { NightSection } from "../night-section";
import { PlayersGoing } from "../players-going";
import { WhatToBring } from "../what-to-bring";
import {
  AsyncButton,
  Body,
  Button,
  Card,
  CardImage,
  type ZoomCard,
  ErrorLine,
  Input,
  Loading,
  Muted,
  Tap,
  Title,
} from "../ui";
import { inRailOrder } from "../rail-order";
import { AccountPitch } from "../account-pitch";
import { RoomTimersCard } from "../room-timers";
import { OpenToTradesTag } from "../open-to-trades-tag";
import { TournamentHelpModal } from "../tournament-help";
import { PlayerAvatar } from "../player-avatar";
import { PlayerPeekModal } from "../player-peek";
import { QuantityBadge } from "../quantity-badge";
import { useTabBarInset } from "../glass";
import { colors, gutter, radius, spacing } from "../theme";
import { refreshTick } from "../refresh-tick";

/*
 * How often the room re-reads, by phase: the website's RoomTicker
 * intervals, so an offer never looks slower in the pocket client.
 * Twelve seconds live; sixty on an early board, where people are still
 * at home; none at all for a night that is only upcoming, where nothing
 * moves but Going and the button re-reads on its own. A shut door
 * ("Not open yet") keeps the live rhythm so it opens the moment the
 * store opens it; a finished room has nothing left to watch.
 */
const POLL_MS: Record<RoomPhase, number | null> = {
  live: 12_000,
  early: 60_000,
  upcoming: null,
  pending: 12_000,
  finished: null,
};

/** Before the room has answered, and for a counter with no room yet. */
const POLL_MS_UNKNOWN = 12_000;

/** The poll for a phase, or null for no poll at all. */
export function pollMsFor(phase: RoomPhase | null): number | null {
  return phase === null ? POLL_MS_UNKNOWN : POLL_MS[phase];
}

/*
 * How many cards a player's section shows before it folds. The founder
 * asked what a hundred Flares does to the room: past this many, a
 * control at the section's end says "and N more" and opens the whole
 * section in place, and reads "Show less" while it is open. The website
 * folds at the same count, with the same words.
 */
const SECTION_FOLD = 6;

/**
 * How often the viewer's matches are re-read while the room polls.
 * The matcher reads every binder on the roster, so it does not ride
 * the twelve-second live poll; a minute is the early board's rhythm,
 * and a pull, a Going or a fresh open reads it at once.
 */
const MATCHES_REFRESH_MS = 60_000;

/**
 * The Room screen: the app's rendering of `/e/[code]`, a Night's page.
 *
 * The founder (2026-10-03): "Do NOT make Nights feel like a generic
 * social media event page. It should feel like a trading dashboard."
 * Top to bottom, the website's hierarchy: the compact header (venue,
 * name, when, one line of RSVP and attendance), the early banner,
 * Matches for you with the mutual match blocks, What to bring, Flares
 * at this Night (the board grouped under whoever posted, with the
 * All / Hunting / Offering filter), Players going, Event details
 * folded shut, and the floating "+ Flare" button in place of the lime
 * action bar. The lobby for a counter code is unchanged.
 */
export function RoomTab() {
  const [code, setCode] = useState<string | null>(null);
  /* What is being typed, for the player whose camera will not focus. */
  const [typed, setTyped] = useState("");
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const tabInset = useTabBarInset();
  /*
   * The account, for the stores it follows. Null while signed out or
   * until the read lands, and the card below simply does not draw:
   * a guest has nothing to follow with.
   */
  const [me, setMe] = useState<Me | null>(null);
  const [rsvping, setRsvping] = useState<string | null>(null);
  const [unfollowing, setUnfollowing] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void lastRoom().then((value) => {
        if (live) setCode(value);
      });
      void (async () => {
        if (!(await storedAccessToken())) {
          if (live) setMe(null);
          return;
        }
        try {
          const result = await getMe();
          if (live) setMe(result);
        } catch {
          /* Keep whatever was on screen; the next focus retries. */
        }
      })();
      return () => {
        live = false;
      };
    }, []),
  );

  /*
   * "I'll be there", the app's way: join the early board under the
   * account's own name and post every Flare. Duplicates already
   * on the board are skipped by the server, so this is safe to repeat.
   */
  const rsvp = async (local: Me["locals"][number]) => {
    if (!me || !local.nextEventCode || rsvping) return;
    setRsvping(local.storeId);
    try {
      await joinRoom(local.nextEventCode, me.player.displayName);
      for (const want of me.wants) {
        await postFlare(local.nextEventCode, {
          cardId: want.cardId,
          printingId: want.printingId,
          quantity: want.quantity,
          note: want.note ?? undefined,
          deckLabel: want.deckLabel,
        }).catch(() => {});
      }
      await rememberRoom(local.nextEventCode);
      setCode(local.nextEventCode);
    } catch {
      // The room shows the truthful state; nothing to add here.
    } finally {
      setRsvping(null);
    }
  };

  /* Unfollow: the row goes at once, and the server is told after. */
  const unfollow = async (storeId: string) => {
    if (unfollowing) return;
    setUnfollowing(storeId);
    try {
      await removeLocal(storeId);
      setMe((current) =>
        current
          ? {
              ...current,
              locals: current.locals.filter((entry) => entry.storeId !== storeId),
            }
          : current,
      );
    } catch {
      /* Still followed; the row stays, honestly. */
    } finally {
      setUnfollowing(null);
    }
  };

  /* The row's second line: the website's, word for word. */
  const nextLine = (local: Me["locals"][number]) => {
    if (local.liveNow) return "A room is open right now";
    if (local.nextEventAt) {
      const day = new Date(local.nextEventAt).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      return `Next: ${local.nextEventName} · ${day}`;
    }
    return [local.city, local.region].filter(Boolean).join(", ");
  };

  if (!code) {
    const locals = me?.locals ?? [];
    const wantCount = me?.wants.length ?? 0;

    return (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
          gap: spacing(4),
          paddingBottom: spacing(4) + tabInset,
        }}
      >
        {/*
         * Getting INTO a room happens here now, not on the Feed. The
         * founder: "move the qr code scanner/code entry to Room. No need
         * to have that in the feed." Both ways in are on this card,
         * because typing is a first-class route and not a consolation,
         * a meaningful share of players have a camera that will not
         * focus, a locked-down work phone or a cracked screen.
         */}
        <Card>
          <Title>No room yet</Title>
          <Body>
            Scan the code at your store&rsquo;s counter, or type it here. Either way
            cardflare reopens the room where you left it.
          </Body>

          <Button label="Scan a code" onPress={() => navigation.navigate("Scan")} />

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

        {/*
         * The stores you follow, in the one place that list lives: the
         * website's /room card, row for row. A row opens the store's
         * page; "I'll be there" walks onto a board that is open early,
         * Flares and all; Unfollow is the way off the list.
         */}
        {locals.length > 0 && (
          <Card>
            <Title>Following</Title>
            <Muted>Stores you follow. Joining a room follows the store too.</Muted>
            <View>
              {locals.map((local, index) => (
                <View
                  key={local.storeId}
                  style={{
                    gap: spacing(2),
                    paddingVertical: spacing(3),
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing(2),
                    }}
                  >
                    <Tap
                      onPress={() =>
                        navigation.navigate("StoreProfile", { storeId: local.storeId })
                      }
                      accessibilityLabel={local.name}
                      style={{ flex: 1, gap: 2 }}
                    >
                      <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
                        {local.name}
                      </Text>
                      <Text
                        style={{
                          color: local.liveNow ? colors.accent : colors.textMuted,
                          fontSize: 12,
                        }}
                      >
                        {nextLine(local)}
                      </Text>
                    </Tap>
                    <Tap
                      onPress={() => void unfollow(local.storeId)}
                      disabled={unfollowing === local.storeId}
                      accessibilityLabel={`Unfollow ${local.name}`}
                      hitSlop={8}
                    >
                      <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                        {unfollowing === local.storeId ? "Unfollowing…" : "Unfollow"}
                      </Text>
                    </Tap>
                  </View>

                  {/* The button carries the count so the tap never posts
                      more than it said. */}
                  {local.earlyOpen && local.nextEventCode && (
                    <Button
                      label={
                        rsvping === local.storeId
                          ? "Posting…"
                          : wantCount > 0
                            ? `I'll be there. Post my ${wantCount} ${
                                wantCount === 1 ? "Flare" : "Flares"
                              }`
                            : "I'll be there"
                      }
                      variant="secondary"
                      onPress={() => void rsvp(local)}
                      busy={rsvping === local.storeId}
                    />
                  )}
                </View>
              ))}
            </View>
          </Card>
        )}
      </ScrollView>
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
  /** Jump this tab to another room, how an early board is stepped into. */
  onSwitch: (code: string) => void;
  /** Drop the remembered code and go back to the way in. */
  onForget: () => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const insets = useSafeAreaInsets();
  /*
   * The floating tab bar, when this room IS the tab. Zero when it has
   * been pushed onto the stack instead, where there is no tab bar and
   * the home indicator is the only thing to clear - which is why
   * everything below takes the LARGER of the two rather than adding
   * them. The tab bar's height already contains the safe-area inset, so
   * adding would have pushed the action bar a whole indicator too high
   * on the one screen people actually use it on.
   */
  const tabInset = useTabBarInset();
  const bottomClear = Math.max(tabInset, insets.bottom);
  const [state, setState] = useState<RoomState | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* The room answered "no such code", as opposed to not answering. */
  const [dead, setDead] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /* The first-tournament guide, folded behind its link. */
  const [tournamentHelp, setTournamentHelp] = useState(false);

  /*
   * The join resumed a seat this account already had. Kept for the visit
   * rather than the session: it answers "did my tap do anything", and once
   * the player is reading the board the answer has been given.
   */
  const [resumed, setResumed] = useState(false);
  /* How many of the account's Flares did not fit on the board at the
     join, and what the board holds. Said once, like `resumed`. */
  const [skipped, setSkipped] = useState<{ count: number; cap: number } | null>(null);

  /*
   * The viewer's matches at this night: who has what they want, who
   * wants what they have, what to bring. Null until the first read
   * lands, and never read for a guest, who sees the sign-in pitch in
   * the section's place. `matchesAt` is when it was last read, so the
   * live poll does not re-run the matcher every twelve seconds.
   */
  const [matches, setMatches] = useState<NightMatches | null>(null);
  const matchesAt = useRef(0);

  /* All, Hunting or Offering, over Flares at this Night. Per visit. */
  const [filter, setFilter] = useState<FlareFilter>("all");

  /*
   * The founder's synthesis, replacing the stacked/carousel toggle: the
   * rail is every player's default face, and the chevron on a player's
   * header unfolds THEM into the full stacked view, the same gesture
   * the roster taught. Detail is a per-person question, not a mode.
   */
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  /*
   * Which long sections have been opened past SECTION_FOLD, keyed by
   * player. Per visit, like `expandedGroups`: a board someone unfolded
   * is not a setting.
   */
  const [foldOpen, setFoldOpen] = useState<Record<string, boolean>>({});

  /*
   * Which player's rail has nothing further to scroll, so the trailing
   * fade can get out of the way. The two widths live in refs rather
   * than state because they are inputs to that decision, not something
   * the screen renders, writing them through state would re-render the
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

  /* "Taken down. Undo", for the server's minute. Declared up here with
     the rest, above every early return, for the same reason as `peek`. */
  const [undo, setUndo] = useState<UndoOffer | null>(null);
  const dismissUndo = useCallback(() => setUndo(null), []);

  /*
   * Whether this phone holds an account, known before the room answers.
   *
   * The guest pitch used to key off the server's `account` alone, and a
   * stale token got a room back with no account in it - so a signed-in
   * player saw "You're in as a guest" for a poll or two. The keychain
   * is the faster witness: with a token on the phone the pitch is never
   * the right thing to show, whatever one response said.
   */
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    storedAccessToken()
      .then((token) => {
        if (live) setSignedIn(Boolean(token));
      })
      .catch(() => {
        if (live) setSignedIn(false);
      });
    return () => {
      live = false;
    };
  }, []);
  const guest = signedIn === false && !state?.account;

  const refresh = useCallback(
    async (options?: { matches?: boolean }) => {
      if (inFlight.current) return;
      inFlight.current = true;

      try {
        const fresh = await getRoom(code);
        setState(fresh);
        setError(null);

        /*
         * The matches, for a signed-in viewer at a night: on the first
         * read, on a pull, on Going, and otherwise once a minute. An
         * older server without the route, or a failed read, leaves what
         * is on screen; a viewer with no account is never asked for.
         */
        const eventId = fresh.room?.eventId ?? fresh.eventId ?? null;
        const wanted =
          options?.matches || Date.now() - matchesAt.current >= MATCHES_REFRESH_MS;
        if (eventId && wanted && (await storedAccessToken())) {
          matchesAt.current = Date.now();
          try {
            setMatches(await getNightMatches(eventId));
          } catch {
            /* Garnish on the room; the room must not fail over it. */
          }
        }

        /*
         * ALREADY IN, WITH NOTHING TO PROVE IT.
         *
         * The founder: "if i join a room on my computer... if i open that
         * same room in app, it should skip the whole join thing... if im
         * in a room it should just be persistent across platforms."
         *
         * The server now finds a signed-in player's seat by account, so
         * the room answers `joined` on a phone that has never held a
         * token for it. That is enough to draw the board - every room
         * route resolves the same way - but it costs an account lookup on
         * every poll. So the seat is adopted ONCE, through the join the
         * tap used to make: it mints a token for the session already
         * there rather than adding a second person to the board.
         */
        if (fresh.joined && !(await storedSessionToken())) {
          /* Silent on purpose: nothing was asked for, so nothing is
           reported. A failure just means the next poll tries again, and
           the account lookup keeps the room working meanwhile. */
          await joinRoom(code).catch(() => {});
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
    },
    [code],
  );

  useEffect(() => {
    setState(null);
    setResumed(false);
    setSkipped(null);
    setExpandedGroups({});
    setMatches(null);
    matchesAt.current = 0;
    void refresh();
  }, [refresh]);

  /* The poll, by phase. Re-armed when the phase changes, so an early
     board that goes live speeds up without a visit. */
  const phase = state ? roomPhaseOf(state) : null;
  const pollMs = pollMsFor(phase);
  useEffect(() => {
    if (pollMs === null) return;
    const timer = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(timer);
  }, [refresh, pollMs]);

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
      setSkipped(
        result.skipped && result.skipped > 0
          ? { count: result.skipped, cap: result.boardCap ?? 100 }
          : null,
      );
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

  /**
   * "Take down" on your own tile: the Flare's second exit. "Found it"
   * (`removeFlare`) marks every copy found and the Feed says so; this
   * withdraws the card and says nothing, and the toast holds the undo
   * for the minute the server allows. Same two controls on the website's
   * board.
   */
  const takeDown = async (flareId: string) => {
    let offer: UndoOffer | null = null;
    try {
      const result = await takeDownRoomFlare(code, flareId);
      if (result.ok && result.flareIds.length > 0) {
        const flareIds = result.flareIds;
        offer = {
          key: `${flareId}:${Date.now()}`,
          message: "Taken down.",
          onUndo: async () => {
            await restoreRoomFlares(code, flareIds).catch(() => undefined);
            await refresh();
          },
        };
      }
    } catch {
      // The re-render shows the truthful state either way.
    }
    await refresh();
    if (offer) setUndo(offer);
  };

  if (!state) {
    if (!error) {
      return <Loading label="Opening the room" />;
    }
    return (
      <View style={{ paddingHorizontal: gutter, paddingVertical: spacing(4) }}>
        <Card>
          <Title>No room on that code</Title>
          <ErrorLine message={error} />
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
           * way back to the field, offered only when the room is
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
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
          gap: spacing(4),
        }}
      >
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

        {guest && <AccountPitch variant="join" />}

        {/* Nothing at the counter, but a board may already be taking
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
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
          gap: spacing(4),
        }}
      >
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

        {/* Nothing at the counter, but a board may already be taking
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

  /*
   * Going, when the server knows the word, and the night's id the
   * header's chip and the matcher need. Both absent from an older
   * server, which gets a header with no chip and no matches.
   */
  const going = goingOf(state);
  const eventId = room.eventId ?? state.eventId ?? null;
  const joined = Boolean(state.joined);
  /* A phase the board takes Flares in. An older server without the
     word is read off the flags it does send. */
  const writable =
    phase === null
      ? room.status === "open" || room.early
      : phase === "live" || phase === "early";
  const finished = phase === "finished" || (phase === null && room.status === "closed");
  const shut = finished || phase === "pending";

  /*
   * THE WAY IN, for whoever still needs one. A signed-in viewer says
   * Going on the header line and is on the roster with their Flares;
   * that is the join, before the night and during it. The name form
   * stays for a guest, who has no account to be Going as, and for a
   * server too old to say Going, in a room that is taking people.
   */
  const needsJoinForm =
    !joined && (guest || !going || !eventId) && (room.status === "open" || room.early);

  /* The viewer's seat, once they have one; the board reads without it. */
  const youId = state.you?.sessionId ?? null;
  const participants = state.participants ?? [];

  /* The account behind each session, for tapping a board header. */
  const playerBySession = new Map(
    participants.map((p) => [p.playerSessionId, p.playerId ?? null]),
  );
  /* All, Hunting or Offering: the filter runs before the board groups. */
  const flares = filterFlares(state.flares ?? [], filter);
  const youOpen = participants.some(
    (p) => p.playerSessionId === youId && p.openToTrades,
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

  /*
   * Your own section leads with what you just posted. The audit: a new
   * card sat behind "and N more" on the rail of the person who had just
   * put it up. The newest leads, before the fold cuts; everybody
   * else's section keeps the board's order. An older server sends no
   * `createdAt`, and ties leave the order as it came.
   */
  const own = youId ? groups.get(youId) : undefined;
  if (own) {
    own.flares = [...own.flares].sort(
      (a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? "") || 0,
    );
  }

  /*
   * Attendance, for the header's one line. People, not seats: an
   * account in from two devices is one face and one in the count. See
   * dedupeParticipants. The server's presence count when it sends one, the
   * present seats it can see otherwise; the players count is the
   * roster's, and the roster is whoever the answer carries.
   */
  const people = dedupeParticipants(participants);
  const roster = rosterOf(state);
  const hereNow = room.hereNow ?? people.filter((p) => p.present).length;
  const playersCount = going?.goingCount ?? roster.length;
  const matchesByPlayer = matches?.perPlayer ?? {};
  const bring = matches?.bring ?? [];
  const openPlayer = (playerId: string) =>
    navigation.navigate("NightPlayer", { code, playerId });
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: gutter + spacing(1),
          paddingTop: spacing(3),
          gap: spacing(4),
          paddingBottom: spacing(20) + bottomClear,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accent}
            onRefresh={() => {
              refreshTick();
              setRefreshing(true);
              void refresh({ matches: true }).finally(() => setRefreshing(false));
            }}
          />
        }
      >
        {/*
         * THE HEADER. One compact block: the venue with its glyph and
         * the Follow chip, the night's name with the remote and the
         * help door at the end of its line, when, and the one line of
         * RSVP and attendance. The founder: "REMOVE REPEATED
         * INFORMATION." Attendance is said here and nowhere else.
         */}
        <NightHeader
          name={room.name}
          storeName={room.storeName}
          storeId={room.storeId}
          verified={room.verified}
          /* The Follow chip is for a signed-in account only, the
             website's rule: a guest has the account pitch below. */
          following={room.storeId && state.account ? state.following : undefined}
          startsAt={room.startsAt}
          endsAt={room.endsAt}
          phase={phase}
          eventId={eventId}
          going={going}
          playersCount={playersCount}
          hereNow={hereNow}
          onSettled={() => void refresh({ matches: true })}
          right={
            <>
              {/* The organizer's door to the timer remote; nothing for
                  anyone else. */}
              <RemoteEntry />
              {/* For the person deciding whether to sit down next
                  week: the same guide the website links from its
                  event page. */}
              <DoorIconButton
                icon="help-circle-outline"
                label="How a night works"
                onPress={() => setTournamentHelp(true)}
              />
            </>
          }
        />

        <TournamentHelpModal
          open={tournamentHelp}
          onClose={() => setTournamentHelp(false)}
        />

        {/* The one-line banner, early only; the long text is behind
            the glyph. The big early-board card is gone. */}
        {phase === "early" ? <EarlyBanner /> : null}

        {/* The two shut doors keep their lines, under the header
            rather than in a tall card. Closed points at the Follow
            chip only when there is one to press. */}
        {shut ? (
          <View style={{ gap: spacing(1) }}>
            <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
              {finished ? "This room has closed" : "Not open yet"}
            </Text>
            <Body>
              {!finished
                ? "The store has not opened this room yet. Scan the code again when it starts."
                : state.account && state.following === false
                  ? `This room has closed. Follow ${room.storeName} above to hear about the next one.`
                  : "This room has closed. Thanks for coming."}
            </Body>
          </View>
        ) : null}

        {/* The name form, for whoever Going cannot carry in. */}
        {needsJoinForm ? (
          <Card>
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
          </Card>
        ) : null}

        {/*
         * MATCHES FOR YOU: the first section under the header, for a
         * signed-in viewer. A guest sees the sign-in pitch in its
         * place, because matching is between accounts and their
         * binders. A finished night has no matches to draw.
         */}
        {guest ? (
          finished ? null : (
            <AccountPitch variant={joined ? "room" : "join"} />
          )
        ) : eventId && !finished ? (
          <MatchesForYou
            matches={matches}
            onSeeAll={() => navigation.navigate("NightMatches", { code })}
            onPlayer={openPlayer}
          />
        ) : null}

        {/* What to bring, only when there is something to pack. */}
        {!guest && eventId && !finished && bring.length > 0 ? (
          <WhatToBring eventId={eventId} bring={bring} />
        ) : null}

        {/* The wall's clocks, for a seat that cannot see the wall, or
            somebody who stepped out with the room in their pocket. */}
        <RoomTimersCard timers={state.timers} />

        {/* The same words the website uses, for the same moment. */}
        {skipped && (
          <Muted>
            {`${skipped.count} of your Flares did not fit. The board holds ${skipped.cap} per player. The rest stay on your list, and the Feed still shows them.`}
          </Muted>
        )}

        {resumed && (
          <Muted>
            You were already in this room. Same seat, same Flares, same binder: your
            account is one player here however you got in, so nothing was posted twice.
          </Muted>
        )}

        {/*
         * THE BOARD: every Flare at this Night, grouped under whoever
         * posted it, players separated by hairlines, with the All /
         * Hunting / Offering filter on the section's label line. The
         * tiles and the offer flow are exactly what they were; a
         * viewer without a seat reads the same board without them.
         */}
        {/* A shut door with nothing on the board draws no board: a
            closed night the server sends no Flares for has nothing to
            filter, and "Nothing posted yet" would be a lie about it. */}
        {shut && (state.flares ?? []).length === 0 ? null : (
          <NightSection
            label={FLARES_AT_THIS_NIGHT}
            right={<FlareFilterRow value={filter} onChange={setFilter} />}
          >
            {joined ? (
              <>
                {groups.size === 0 && (
                  <Body>
                    {filter === "all"
                      ? "Nothing posted yet. Yours would be the first one on the board tonight."
                      : emptyFilterLine(filter)}
                  </Body>
                )}

                {[...groups.entries()].map(([sessionId, group], index) => {
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

                  const tile = (flare: RoomFlare) => (
                    <CarouselFlare
                      key={flare.id}
                      flare={flare}
                      mine={mine}
                      reserveCaption={railHasDecks}
                      siblings={shelf}
                      position={shelfAt.get(flare.id) ?? 0}
                      onRemove={() => act(() => removeFlare(code, flare.id))}
                      onTakeDown={() => takeDown(flare.id)}
                    />
                  );

                  /* Fully pledged hunts park at the rail's far end, dimmed but
             present, the bring-extras crowd can still see the ask. */
                  const isCovered = (flare: RoomFlare) =>
                    flare.offers.length > 0 &&
                    pledgeTally(flare.offers, flare.quantity).remaining === 0;

                  /*
                   * Cards you can answer come first, the website's rule, word for
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
                  /*
                   * ONE SHELF, BOTH DIRECTIONS - the wants in rail order, then
                   * the showcases in theirs.
                   *
                   * The founder: "when a flare is in the 'letting go' tab if im
                   * trying to offer something up, when i click it, it only shows
                   * the cards that are in cards im looking for. the letting go
                   * cards should be swipable in the carousel like normal, but
                   * should say im offering it up or letting it go once i swipe
                   * to it."
                   *
                   * The shelf was built from `wants` alone, so a showcase tile
                   * was never in it: `shelfAt` missed, the `?? 0` put the viewer
                   * at the FIRST WANTED CARD, and opening a card somebody was
                   * letting go showed a card they were hunting instead.
                   *
                   * They stay visibly separate - the two sections below are
                   * untouched - but the swipe runs through both, which is what
                   * the website has always done. The zoom reads `direction` off
                   * each card, so swiping onto a showcase says "Offering"
                   * on its own.
                   */
                  const orderedRail = [
                    ...inRailOrder(railFlares, held, isCovered),
                    ...inRailOrder(showcases, held, isCovered),
                  ];

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
                      f.offers.length > 0
                        ? pledgeTally(f.offers, f.quantity).remaining
                        : null,
                    pledges: f.offers.map((offer) => ({
                      name: offer.displayName ?? "A player",
                      quantity: offer.quantity,
                    })),
                    youHave: f.match
                      ? { kind: f.match, count: f.heldCount ?? 0 }
                      : null,
                    /* The offer, for somebody else's want only: your own card
               has nothing to offer on, and a card on offer is answered
               at the table, not with a hand. */
                    offer:
                      mine || f.intent === "showcase"
                        ? null
                        : {
                            early: room.early,
                            quantity: f.quantity,
                            own: (() => {
                              const own = f.offers.find(
                                (o) => o.responderSessionId === youId,
                              );
                              return own
                                ? { quantity: own.quantity, message: own.message }
                                : null;
                            })(),
                            onOffer: (message, quantity) =>
                              act(() => offerOnFlare(code, f.id, message, quantity)),
                            onWithdraw: () => act(() => withdrawOffer(code, f.id)),
                          },
                  }));
                  const shelfAt = new Map(orderedRail.map((f, index) => [f.id, index]));

                  /*
                   * THE FOLD. A section shows at most SECTION_FOLD cards; past
                   * that, a control at its end says how many are waiting and
                   * opens the whole section in place. The shelf above was built
                   * from the whole section on purpose: the zoom still pages
                   * every card, not only the ones the fold left showing.
                   *
                   * The rail and the stacked list each fold by their own drawn
                   * order, so what you see is always the first six of what that
                   * view would have drawn.
                   */
                  const total = group.flares.length;
                  const folded = total > SECTION_FOLD && !foldOpen[sessionId];
                  const foldLabel =
                    total > SECTION_FOLD
                      ? folded
                        ? `and ${total - SECTION_FOLD} more`
                        : "Show less"
                      : null;
                  const toggleFold = () => {
                    LayoutAnimation.configureNext(
                      LayoutAnimation.Presets.easeInEaseOut,
                    );
                    setFoldOpen((current) => ({
                      ...current,
                      [sessionId]: !current[sessionId],
                    }));
                  };

                  /* The rail draws the shelf's order: wants, the divider, then
               the showcases. Cut at six, the divider only stands when a
               showcase made it through. */
                  const railShown = folded
                    ? orderedRail.slice(0, SECTION_FOLD)
                    : orderedRail;
                  const railWantsShown = railShown.filter(
                    (f) => f.intent !== "showcase",
                  );
                  const railShowcasesShown = railShown.filter(
                    (f) => f.intent === "showcase",
                  );

                  /* The stacked list draws showcases first, then the folders,
               then the loose cards, and its first six are those. A folder
               the cut lands inside shows the cards within the six and
               nothing of the rest; its heading still counts the whole
               folder, because that is how many it holds. */
                  const stackOrder = [
                    ...showcases,
                    ...folders.flatMap((f) => f.flares),
                    ...loose,
                  ];
                  const stackShown = new Set(
                    (folded ? stackOrder.slice(0, SECTION_FOLD) : stackOrder).map(
                      (f) => f.id,
                    ),
                  );
                  const inStack = (list: RoomFlare[]) =>
                    list.filter((f) => stackShown.has(f.id));
                  const showcasesShown = inStack(showcases);
                  const wantsShown = inStack(wants);
                  const foldersShown = folders
                    .map((folder) => ({
                      label: folder.label,
                      total: folder.flares.length,
                      flares: inStack(folder.flares),
                    }))
                    .filter((folder) => folder.flares.length > 0);
                  const looseShown = inStack(loose);

                  const rows = (list: RoomFlare[]) =>
                    list.map((flare) => (
                      <FlareRow
                        key={flare.id}
                        flare={flare}
                        mine={mine}
                        storeName={room.storeName}
                        early={room.early}
                        onOffer={(message, quantity) =>
                          void act(() =>
                            offerOnFlare(code, flare.id, message, quantity),
                          )
                        }
                        onRemove={() => act(() => removeFlare(code, flare.id))}
                        onTakeDown={() => takeDown(flare.id)}
                        onTraded={(partner) =>
                          void act(() => confirmTrade(code, flare.id, partner))
                        }
                      />
                    ));

                  const groupOpen = Boolean(expandedGroups[sessionId]);

                  return (
                    <View
                      key={sessionId}
                      style={{
                        gap: spacing(1),
                        /* The hairline between players; the card's own gap
                   sits above it and this padding below. */
                        paddingTop: index === 0 ? 0 : spacing(2),
                        borderTopWidth: index === 0 ? 0 : 1,
                        borderTopColor: colors.border,
                      }}
                    >
                      {/*
                       * The founder's synthesis, replacing the page-wide toggle:
                       * the rail is every player's default face, and the chevron
                       * on their header unfolds THEM into the full stacked view,
                       * the same gesture the roster taught.
                       */}
                      <Tap
                        onPress={() => {
                          LayoutAnimation.configureNext(
                            LayoutAnimation.Presets.easeInEaseOut,
                          );
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
                          /* Two points shorter than it was, given to the rail
                     below so a held card's ring clears this line. */
                          paddingBottom: spacing(1),
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
                                  size={48}
                                />
                                {/*
                                 * The name and the line under it are a COLUMN
                                 * beside the picture, never items wrapped around
                                 * it. Placed after the picture-and-name pair, the
                                 * tag lands beneath the PICTURE and reads as a
                                 * caption on the avatar, the same bug the
                                 * website had, reported three times.
                                 */}
                                <View style={{ flexShrink: 1, gap: spacing(1) }}>
                                  <Title>{group.name ?? "A player"}</Title>
                                  {openIds.has(sessionId) && <OpenToTradesTag />}
                                </View>
                              </View>
                            );
                            return playerBySession.get(sessionId) ? (
                              <Tap
                                onPress={() => setPeek(playerBySession.get(sessionId)!)}
                              >
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
                              railLayout.current[sessionId] =
                                event.nativeEvent.layout.width;
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
                              if (layout != null)
                                railMeasure(sessionId, width, layout, 0);
                            }}
                            /*
                             * Pulled back by exactly the padding below, so the
                             * first card's edge lands on the same line as the
                             * header above it. The padding itself is for the ring
                             * on a card you are holding: a ScrollView clips what
                             * leaves its bounds, and the ring sits two pixels
                             * outside the art with a glow past that. The website
                             * had this bug and this fix.
                             *
                             * The same allowance on top. The rail used to start
                             * four points under the header's hairline with no
                             * vertical padding of its own, so a held card's ring
                             * sat two points off the divider and its glow drew
                             * straight across it: the founder's screenshot. Four
                             * more points on top put the ring and its whole
                             * shadow under the line, and the header gives back
                             * two of its own so the row does not visibly loosen.
                             */
                            style={{ marginHorizontal: -spacing(2) }}
                            contentContainerStyle={{
                              gap: spacing(2),
                              paddingHorizontal: spacing(2),
                              paddingTop: spacing(1),
                              paddingBottom: 0,
                              alignItems: "flex-start",
                            }}
                          >
                            {railWantsShown.map(tile)}
                            {railShowcasesShown.length > 0 && (
                              <>
                                <View
                                  style={{
                                    width: 1,
                                    alignSelf: "stretch",
                                    backgroundColor: colors.border,
                                    marginHorizontal: spacing(0.5),
                                  }}
                                />
                                {railShowcasesShown.map(tile)}
                              </>
                            )}
                            {/* The fold's control, the size of a tile's art so
                          it stands in the rail like one more card. */}
                            {foldLabel && (
                              <Tap onPress={toggleFold} style={styles.foldTile}>
                                <Text style={styles.foldText}>{foldLabel}</Text>
                              </Tap>
                            )}
                          </ScrollView>
                          {/*
                           * The edge fades so the rail visibly continues instead
                           * of the last card looking cut off, and stops fading
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
                          {labelled && showcasesShown.length > 0 && (
                            <View style={{ gap: spacing(1) }}>
                              <Text style={styles.folderLabel}>
                                {`Offering · ${showcases.length} ${
                                  showcases.length === 1 ? "card" : "cards"
                                }`}
                              </Text>
                              <View>{rows(showcasesShown)}</View>
                            </View>
                          )}

                          {labelled && wantsShown.length > 0 && (
                            <Text style={styles.folderLabel}>
                              {`Looking for · ${wants.length} ${
                                wants.length === 1 ? "card" : "cards"
                              }`}
                            </Text>
                          )}

                          {foldersShown.map((folder) => (
                            <View
                              key={folder.label.toLowerCase()}
                              style={{ gap: spacing(1) }}
                            >
                              <Text style={styles.folderLabel} numberOfLines={1}>
                                {`${folder.label} · ${folder.total} ${
                                  folder.total === 1 ? "card" : "cards"
                                }`}
                              </Text>
                              <View>{rows(folder.flares)}</View>
                            </View>
                          ))}

                          {looseShown.length > 0 && <View>{rows(looseShown)}</View>}

                          {/* The fold's control as a row, where the list's eye
                        already is. */}
                          {foldLabel && (
                            <Tap onPress={toggleFold} style={styles.foldRow}>
                              <Text style={styles.foldText}>{foldLabel}</Text>
                            </Tap>
                          )}
                        </>
                      )}
                    </View>
                  );
                })}

                {/* A guest has no composer, so the toggle that moved into the
                  composer's foot would vanish for them. One quiet row here
                  keeps it; a signed-in player finds it under Post a Flare. */}
                {guest && (
                  <AsyncButton
                    label={youOpen ? "Open to trades ✓" : "I'm open to trades"}
                    pendingLabel={youOpen ? "Closing…" : "Opening…"}
                    variant="secondary"
                    onPress={() => act(() => setOpenToTrades(code, !youOpen))}
                  />
                )}
              </>
            ) : (
              <ReadOnlyBoard flares={flares} filter={filter} />
            )}
          </NightSection>
        )}

        {/* PLAYERS GOING: low on the page, and each row says why the
            person matters. A tap opens their event-facing profile. */}
        <PlayersGoing
          roster={roster}
          matchesByPlayer={matchesByPlayer}
          live={phase === "live"}
          onPlayer={openPlayer}
        />

        {/* EVENT DETAILS, folded shut: venue, address, organizer, code. */}
        <EventDetails
          storeName={room.storeName}
          verified={room.verified}
          address={room.store?.address ?? null}
          code={code}
          onStore={
            room.storeId
              ? () => navigation.navigate("StoreProfile", { storeId: room.storeId! })
              : undefined
          }
        />

        {trades.length > 0 && (
          <NightSection label="Traded tonight" last>
            <Muted>
              Only you can see this list. The store sees tonight's totals, never who
              traded what.
            </Muted>
            <View>
              {trades.map((trade) =>
                trade.awaitingYou ? (
                  /* The second hand: the partner is asked, and their Yes
                     is what pays both sides. The website's row, natively. */
                  <View
                    key={trade.id}
                    style={{
                      gap: spacing(2),
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                      paddingVertical: spacing(2.5),
                    }}
                  >
                    <Text style={{ color: colors.textPrimary, fontSize: 15 }}>
                      <Text style={{ fontWeight: "700" }}>
                        {trade.partnerName ?? "A player"}
                      </Text>
                      {" says you traded "}
                      <Text style={{ fontWeight: "700" }}>{trade.cardName}</Text>
                      {trade.quantity > 1 ? ` ×${trade.quantity}` : ""}
                      {". Did you?"}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: spacing(3),
                      }}
                    >
                      <Button
                        label="Yes, we traded"
                        onPress={() =>
                          void act(() =>
                            acknowledgeTrade(
                              code,
                              trade.id,
                              trade.flareId,
                              trade.requesterSessionId,
                            ),
                          )
                        }
                      />
                      <Muted>Your tap pays you both Embers.</Muted>
                    </View>
                  </View>
                ) : (
                  <View
                    key={trade.id}
                    style={{
                      gap: 2,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                      paddingVertical: spacing(2),
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: spacing(1.5),
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
                      <QuantityBadge quantity={trade.quantity} size="md" />
                      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                        {trade.youWere === "requester"
                          ? trade.partnerName
                            ? `from ${trade.partnerName}`
                            : "found in the room"
                          : `to ${trade.partnerName ?? "a player"}`}
                      </Text>
                    </View>
                    {tradeStatusLine(trade) ? (
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {tradeStatusLine(trade)}
                      </Text>
                    ) : null}
                  </View>
                ),
              )}
            </View>
          </NightSection>
        )}
      </ScrollView>

      {/* The profile popup, from a board header's face and name. View
          full profile leaves it behind for the profile screen. */}
      <PlayerPeekModal
        playerId={peek}
        onClose={() => setPeek(null)}
        onViewProfile={(playerId) => {
          setPeek(null);
          navigation.navigate("PlayerProfile", { playerId });
        }}
      />

      {/*
       * "+ FLARE", floating above the dock, in place of the lime action
       * bar. The founder: "The current giant lime 'Post a Flare' bar is
       * too visually dominant." It opens the same composer, which
       * attaches the Flare to this night, and carries whether you are
       * open to trades so the composer's toggle starts right. For a
       * seat in a phase that takes Flares; the open-to-trades toggle
       * that used to share the bar lives at the composer's foot.
       */}
      {joined && writable ? (
        <FlareFab
          bottom={bottomClear + spacing(4)}
          onPress={() =>
            navigation.navigate("PostFlare", { code, openToTrades: youOpen })
          }
        />
      ) : null}

      {/* The undo, above the floating button and whatever it clears. */}
      <UndoToast
        offer={undo}
        onDismiss={dismissUndo}
        bottom={FAB_HEIGHT + bottomClear + spacing(6)}
      />
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
 * Sized so five cards share a phone's width, the founder's number,
 * after two rounds of "still too big". At this size the tile is for
 * browsing: art (tap to zoom for the rest), name, count, and one-line
 * signals. The quick offer stays as a text link; writing a note,
 * reading offers and confirming trades live in the stacked view.
 */
function CarouselFlare({
  flare,
  mine,
  reserveCaption,
  siblings,
  position,
  onRemove,
  onTakeDown,
}: {
  flare: RoomFlare;
  mine: boolean;
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
  /** "Found it": every copy in hand, said everywhere. */
  onRemove: () => Promise<void>;
  /** "Take down": withdrawn, nothing said, undo for a minute. */
  onTakeDown: () => Promise<void>;
}) {
  const covered =
    flare.offers.length > 0 &&
    pledgeTally(flare.offers, flare.quantity).remaining === 0;

  /*
   * No offer control on the tile. There used to be a handshake under
   * the art that opened a quantity stepper over the picture, and the
   * founder called it: "the small contextual menu that opens up over
   * the tiny card needs to go... just have people tap the card to
   * open full menu to say they have it or not." Tapping the art opens
   * the zoom sheet, and the sheet carries the offer, the count and the
   * take-back. One place to answer a card, on every rail.
   */

  /*
   * Same complaint, the other side of the trade: Remove sat there
   * looking untouched until the next poll repainted the board. Now the
   * whole tile greys out under a spinner the moment it is tapped, so
   * the tap is visibly taken. Whole tile, not just the art, the card
   * is the thing going away.
   */
  const [removing, setRemoving] = useState(false);

  const run = async (work: () => Promise<void>) => {
    if (removing) return;
    setRemoving(true);
    try {
      await work();
    } finally {
      /* The board usually repaints this tile out of existence first;
         this is for the case where the write failed and it stays. */
      setRemoving(false);
    }
  };

  /*
   * Quantity drawn instead of written, and it is the *live need*, the
   * founder's confirm: copies still unpledged render as faded layers
   * behind the art, fanned out to the RIGHT. Sideways only: the first
   * cut nudged them downward, every stacked tile grew taller, and the
   * rail's names and buttons fell out of line. Three asked with one
   * pledged is a fan of two; fully pledged collapses to a single
   * dimmed card at the rail's end, and the ×N tag says the number. The tile
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
      {/* Fully covered: dimmed AND drained of colour, "taken care of"
          should read from across the room. (filter needs RN 0.76+ with
          the new architecture; this project ships 0.81 with it on.) */}
      <View
        style={{
          gap: spacing(1),
          opacity: covered ? 0.6 : 1,
          filter: covered ? [{ grayscale: 1 }] : undefined,
        }}
      >
        {/* Being removed greys the card and nothing else, the founder's
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
           * A ring on a card you are holding, the website's mark, and the
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
            offer={siblings[position]?.offer ?? null}
            siblings={siblings}
            position={position}
            terms={acceptsLabel(flare)}
          />
          {/*
           * Every signal that used to be its own caption line lives on
           * the art as a badge now. The founder's screenshot counted the
           * handshake at three heights in one rail, variable caption
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
              <Text maxFontSizeMultiplier={1} style={styles.noteBadgeGlyph}>✎</Text>
            </View>
          ) : null}
          {/* The number, right on the card, the fan draws it, this chip
              says it, and both count down together as pledges land.
              Anchored from the fan's bleed so it sits on the top card. */}
          <QuantityBadge
            quantity={visible}
            style={{ position: "absolute", bottom: 2, right: fan + 2, zIndex: 6 }}
          />
        </View>

        <Text numberOfLines={1} style={styles.tileName}>
          {flare.cardName}
        </Text>

        {/* The caption slot: one line tall whether or not THIS card has a
            deck to name, so the action row never drifts across a rail.
            Reserved per rail, so a board where nobody named a deck - very
            nearly every board - has no empty row in it. */}
        {reserveCaption && (
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.tileCaption}>
            {flare.deckLabel ?? " "}
          </Text>
        )}

        {/* The action rows, only on the viewer's own tiles: a Flare's
            two exits, and nothing under anybody else's card, where an
            empty strip would otherwise sit under every one. "Found it"
            is the old Remove; "Take down" withdraws it with an undo. */}
        {mine && (
          <View style={{ height: 44, gap: 2 }}>
            <Tap
              onPress={() => void run(onRemove)}
              disabled={removing}
              hitSlop={4}
              style={styles.removeButton}
            >
              <Text
                maxFontSizeMultiplier={1.3}
                style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600" }}
              >
                Found it
              </Text>
            </Tap>
            <Tap
              onPress={() => void run(onTakeDown)}
              disabled={removing}
              hitSlop={4}
              style={styles.takeDownButton}
            >
              <Text maxFontSizeMultiplier={1.3} style={{ color: colors.danger, fontSize: 11, fontWeight: "600" }}>
                Take down
              </Text>
            </Tap>
          </View>
        )}
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
  onTakeDown,
  onTraded,
}: {
  flare: RoomFlare;
  mine: boolean;
  storeName: string;
  /** Early board: offers read as pledges to bring the card. */
  early: boolean;
  onOffer: (message?: string, quantity?: number) => void;
  /** "Found it": every copy in hand, said everywhere. */
  onRemove: () => Promise<void>;
  /** "Take down": withdrawn, nothing said, undo for a minute. */
  onTakeDown: () => Promise<void>;
  onTraded: (partnerSessionId?: string) => void;
}) {
  const [offering, setOffering] = useState(false);
  const [message, setMessage] = useState("");
  const [bringing, setBringing] = useState(1);
  const pledgeLine = pledgeLineFor(flare);

  /* Same acknowledgement as the carousel tile: the row greys out under
     a spinner the moment either exit is tapped. */
  const [removing, setRemoving] = useState(false);

  const run = async (work: () => Promise<void>) => {
    if (removing) return;
    setRemoving(true);
    try {
      await work();
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
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
            >
              <Text
                style={{
                  flexShrink: 1,
                  color: colors.textPrimary,
                  fontSize: 16,
                  fontWeight: "700",
                }}
              >
                {flare.cardName}
              </Text>
              <QuantityBadge quantity={flare.quantity} size="md" />
            </View>
            <Muted>
              {`${flare.cardNumber} · ${flare.printingLabel ?? "Any printing"}`}
            </Muted>
          </View>
          {mine && (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}
            >
              <Tap onPress={() => void run(onRemove)} disabled={removing} hitSlop={8}>
                <Text style={styles.removeLink}>Found it</Text>
              </Tap>
              <Tap onPress={() => void run(onTakeDown)} disabled={removing} hitSlop={8}>
                <Text style={styles.takeDownLink}>Take down</Text>
              </Tap>
            </View>
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
            asking for 2x with one pledged, the room should read "still
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

        {/* Anyone can pledge, no binder match required, the founder's
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
  /* Take down, in the danger colour: the exit that says nothing. */
  takeDownLink: {
    color: colors.danger,
    textDecorationLine: "underline",
    fontSize: 14,
  },
  folderLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  /* The fold's control in the rail: a tile's art box, dashed so it
     reads as a place rather than a card. */
  foldTile: {
    width: 56,
    height: Math.round((56 * 88) / 63),
    borderRadius: radius.control / 2,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing(1),
  },
  /* The same control under the stacked list, as a row like the ones
     above it. */
  foldRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing(3),
  },
  foldText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
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
    fontSize: 11,
    fontWeight: "700",
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
    fontSize: 11,
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
    height: 21,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  /* The ghost of the pair: no border, the danger colour on the word. */
  takeDownButton: {
    height: 21,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});

/**
 * The roster, from whichever answer carries it: the server's roster
 * when it sends one (binders and all), else the participants with
 * their Flares counted off the board and no binders, so a joined view
 * on a server that only puts the roster on the door still lists who
 * is coming.
 */
function rosterOf(state: RoomState): RosterPlayer[] {
  if (state.roster) return state.roster;
  const flares = state.flares ?? [];
  return dedupeParticipants(state.participants ?? []).map((p) => ({
    playerSessionId: p.playerSessionId,
    playerId: p.playerId ?? null,
    displayName: p.displayName ?? "A player",
    avatarUrl: p.avatarUrl ?? null,
    frame: p.frame ?? null,
    ring: p.ring ?? null,
    aura: p.aura ?? null,
    present: p.present,
    flares: flares.filter((f) => f.playerSessionId === p.playerSessionId).length,
    binders: [],
  }));
}

/**
 * The board, to read: every Flare, grouped under whoever posted it,
 * the way the seated board groups them, with no offer controls. For a
 * viewer without a seat yet: the founder, "anyone can go into there
 * and see who is looking for which cards before the tournament or
 * event starts." Tapping a card opens the viewer and the rest of that
 * player's rail. The filter has already run; it only decides the
 * empty line.
 */
function ReadOnlyBoard({
  flares,
  filter,
}: {
  flares: RoomFlare[];
  filter: FlareFilter;
}) {
  const groups = new Map<string, { name: string | null; flares: RoomFlare[] }>();
  for (const flare of flares) {
    const group = groups.get(flare.playerSessionId) ?? {
      name: flare.displayName,
      flares: [],
    };
    group.flares.push(flare);
    groups.set(flare.playerSessionId, group);
  }

  if (groups.size === 0) {
    return (
      <Muted>
        {filter === "all"
          ? "Nothing posted yet. Say you're going and yours go up first."
          : emptyFilterLine(filter)}
      </Muted>
    );
  }

  return (
    <View>
      {[...groups.entries()].map(([sessionId, group], index) => {
        const shelf: ZoomCard[] = group.flares.map((f) => ({
          imageUrl: f.imageUrl,
          name: f.cardName,
          cardNumber: f.cardNumber,
          caption: f.printingLabel,
          note: f.note,
          lookingFor: f.quantity,
          direction: f.intent,
        }));

        return (
          <View
            key={sessionId}
            style={{
              gap: spacing(2),
              paddingVertical: spacing(2.5),
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: colors.border,
            }}
          >
            <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
              {group.name ?? "A player"}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing(2) }}
            >
              {group.flares.map((f, position) => (
                <CardImage
                  key={f.id}
                  imageUrl={f.imageUrl}
                  width={72}
                  name={f.cardName}
                  cardNumber={f.cardNumber}
                  caption={f.printingLabel}
                  note={f.note}
                  lookingFor={f.quantity}
                  direction={f.intent}
                  siblings={shelf}
                  position={position}
                />
              ))}
            </ScrollView>
          </View>
        );
      })}
    </View>
  );
}

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

/** What a settled trade says under itself about its Embers, or nothing. */
function tradeStatusLine(trade: TradeRecord): string | null {
  switch (trade.status) {
    case "pending":
      return trade.youWere === "requester"
        ? `Waiting for ${trade.partnerName ?? "them"} to confirm`
        : null;
    case "late":
      return trade.youWere === "requester"
        ? `${trade.partnerName ?? "They"} never confirmed, so it paid the unconfirmed rate`
        : "Not confirmed in time, so it paid nothing";
    case "disputed":
      return "Reversed. Its Embers were taken back.";
    case "unnamed":
      return "Nobody named, so it earned nothing";
    default:
      return null;
  }
}
