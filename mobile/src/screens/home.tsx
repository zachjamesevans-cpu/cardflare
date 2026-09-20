import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import Animated, {
  interpolate,
  runOnJS,
  runOnUI,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  Text,
  View,
} from "react-native";

import type { StackParams } from "../../App";
import { LOCAL_ENABLED } from "../local-enabled";
import { openRoom } from "../open-room";
import { followHref } from "../follow-href";
import {
  belongsToTab,
  getFeed,
  sectionHeading,
  type FeedEntry,
  type FeedTab,
  getMe,
  joinRoom,
  likePost,
  offerFromPost,
  postFlare,
  rememberRoom,
  removeLocal,
  storedAccessToken,
  type Me,
} from "../api";
import { CardRail, tileWidth } from "../card-rail";
import { FlareFeedCard } from "../flare-feed-card";
import { FlareFeedCardCompact } from "../flare-feed-card-compact";
import { feedViewFrom } from "../feed-views";
import { FlareCardsSheet, type FlareSheetPost } from "../flare-cards-sheet";
import { FlareProgressSheet } from "../flare-progress-sheet";
import { FeedFilterTabs } from "../feed-filter-tabs";
import { FlareMessageSheet, type MessageTarget } from "../flare-message-sheet";
import { PostSocialRow, haveFor, type PostRef } from "../post-social";
import { StorePostCard } from "../store-post-card";
import { Body, Button, Card, CardImage, Muted, Tap, Title, type ZoomCard } from "../ui";
import { silentCoords } from "../location";
import { FeedPerson, GuestChip } from "../feed-person";
import { cachedPlayerId, readCache, writeCache } from "../cache";
import { onFeedStale } from "../feed-refresh";
import {
  CollapsingHeader,
  HEADER_CONTENT_HEIGHT,
  onHeaderScroll,
  settleHeader,
  useHeaderScroll,
} from "../collapsing-header";
import { NearbyLocationAsk } from "../nearby-location-ask";
import { MatchRow } from "../nearby";
import { PlayerAvatar } from "../player-avatar";
import { VerifiedMark } from "../verified-mark";
import { API_BASE } from "../config";
import { colors, gutter, spacing } from "../theme";
import { useTabBarInset } from "../glass";

/**
 * The Feed tab — what is on, and who needs what you are holding.
 *
 * Scanning is not here. It used to be the card at the bottom of this
 * screen, and the founder cut it: "move the qr code scanner/code entry
 * to Room. No need to have that in the feed." Room is the tab you are
 * already opening when you are standing at a counter, and this one is
 * for reading. A signed-in player still gets their locals here — the
 * stores they actually go to, saved automatically on every join.
 */
/**
 * When the doors open, in the store's own clock — the website's `doorsAt`.
 *
 * A board days out needs a day and an hour and nothing else, and "open
 * since" is what the room's own formatter would say, which is true of an
 * event underway and wrong about every board this line is drawn for.
 */
function doorsAt(startsAt: string | null, timeZone: string): string {
  if (!startsAt) return "Taking Flares early";

  return `Doors ${new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(startsAt))}`;
}

/**
 * What the two starter items say — the website's copy, word for word.
 *
 * Kept as data rather than two more branches below, because the pair are
 * the same card with different words in it and the shape is the
 * argument: a question, why it is worth answering, and one button.
 */
const STARTERS = {
  store: {
    icon: "map-marker-outline",
    headline: "Where do you play?",
    body: "Join your store's room once and it saves itself here, with its next board and who is hunting what. The code is on the counter.",
    label: "Enter a store code",
  },
  deck: {
    icon: "clipboard-list-outline",
    headline: "What are you hunting?",
    body: "Paste a deck list and every card in it becomes a want. Walk into any room and it offers to post the lot in one go.",
    label: "Paste a deck list",
  },
} as const;

/**
 * How wide a card is drawn, given how many are in the row.
 *
 * The founder, looking at a lone Flare in the deployed feed: "it looks a
 * little silly to have one single card on a thing." He was right - a
 * thumbnail the size of a thumbnail, marooned in a full-width card, reads
 * as a mistake rather than as one card.
 *
 * The art carries the weight of what is in the row. One card gets a
 * picture worth looking at; a row of them gets a rail of readable tiles.
 *
 * Two sizes, not three. There used to be a third, 48, that a row dropped
 * to once it held four or more - because the row WRAPPED, and four small
 * tiles were what fitted on one line at phone width. Rows scroll
 * sideways now, so nothing has to fit, and shrinking the art was only
 * ever paying for the wrap. A card at 48 was too small to recognise,
 * which on a row about which cards somebody is chasing is the point of
 * the row.
 *
 * The same numbers as the website's, pinned together by
 * tests/unit/app-feed-parity.test.ts: one product, one set of sizes.
 */

/**
 * How far past the top a thumb has to drag before releasing asks for a
 * new feed. Far enough to be deliberate, short enough to reach.
 */
const PULL_TRIGGER = 80;

/**
 * The pull-to-refresh spinner, drawn rather than asked for.
 *
 * Grows and fades in with the drag, so the gesture has an answer while
 * it is still happening, and turns into a real spinner once the load
 * starts. Placed against the header rather than the content, because
 * the content is the thing that moves.
 */
function PullSpinner({
  pull,
  refreshing,
  top,
}: {
  pull: SharedValue<number>;
  refreshing: boolean;
  top: number;
}) {
  /* Worked out on the JS side: a worklet cannot call `spacing`, and
     trying to takes the screen down with a red box rather than failing
     quietly. */
  const drop = spacing(2);

  const style = useAnimatedStyle(() => ({
    opacity: refreshing ? 1 : interpolate(pull.value, [8, PULL_TRIGGER], [0, 1]),
    transform: [
      { scale: refreshing ? 1 : interpolate(pull.value, [8, PULL_TRIGGER], [0.6, 1]) },
      /* Follows the thumb down a little, so it reads as attached to the
         pull rather than pinned over it. */
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
          top: top + spacing(2),
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

/** How long ago, in the shortest form that is still true. */
function agoFrom(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.round(hours / 24)}d ago`;
}

/**
 * The mark is taller than it is wide — BRAND.md's one rule about it. It
 * is sized by height here and its width follows the artwork.
 */
const MARK_ASPECT = 60 / 72;

/** What the Feed keeps between visits: the header, and the items. */
interface CachedFeed {
  me: Me | null;
  items: FeedEntry[];
}

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [me, setMe] = useState<Me | null>(null);
  /* What is on at the places you go, and who needs what you have. The
     website's Feed, from the same server answer. */
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [rsvping, setRsvping] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const locals = me?.locals ?? [];
  /* Following | Nearby. The server files every item under one; an older
     server that sent no `tab` shows everything on each. */
  const [tab, setTab] = useState<FeedTab>("following");
  /* How this player wants the Feed drawn. Anything this build does not
     recognise reads as the original card - see feedViewFrom. */
  const view = feedViewFrom(me?.player.feedView);

  /* Which filter an item belongs under is decided in one place for both
     platforms, version skew and all. See `belongsToTab`. */
  const shown = feed.filter((item) => belongsToTab(item, tab));
  const sectionsShown = new Set(shown.map((item) => item.section)).size;
  /* The Flare being messaged from its paper plane, or null. */
  const [messaging, setMessaging] = useState<MessageTarget | null>(null);
  /* The post whose cards are open in the sheet, to read or to offer on. */
  const [cardsSheet, setCardsSheet] = useState<
    (FlareSheetPost & { mode: "view" | "offer" }) | null
  >(null);
  /* Your own post, with its copies-found stepper open. */
  const [progressSheet, setProgressSheet] = useState<FlareSheetPost | null>(null);

  /*
   * Refs beside the state, because `load` is a stable useCallback with
   * no dependencies — reading `feed` or `me` from its closure would
   * read whatever they were when the screen mounted. These are only
   * ever read, never rendered from.
   */
  /* False until the cached read has resolved, so nothing that means
     "you have nothing" is drawn before we know that is true. */
  const [hydrated, setHydrated] = useState(false);

  /*
   * The header follows the thumb, on the UI thread.
   *
   * The founder wanted Instagram's behaviour: the bar leaves as you go
   * down and comes back the moment you go up, from anywhere in the
   * list. Driving that from JavaScript stutters against the very
   * scroll it is following, which reads worse than not animating at
   * all — so the whole thing is worklets. See collapsing-header.tsx.
   */
  const insets = useSafeAreaInsets();
  const tabInset = useTabBarInset();
  const header = useHeaderScroll();

  /*
   * How much of the top of the list the floating header covers. Named
   * once because four things have to agree about it: the inset, the
   * opening offset, the scrollbar, and the refresh spinner's perch.
   */
  const headerRoom = insets.top + HEADER_CONTENT_HEIGHT;

  /*
   * PULL TO REFRESH, DRAWN BY HAND.
   *
   * React Native's RefreshControl does not render in this app at all -
   * not here and not on Room, which also asks for one. Pinning
   * `refreshing` true produced no spinner AND no content displacement,
   * at any `progressViewOffset`, on a plain ScrollView as well as this
   * one. Measured on the simulator, not reasoned about.
   *
   * So the gesture is read off the scroll already being followed for
   * the header: how far past the top the thumb has dragged, and what to
   * do when it lets go.
   */
  const pull = useSharedValue(0);

  const askForRefresh = useCallback(() => {
    if (refreshingRef.current) return;
    void refresh();
  }, []);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      onHeaderScroll(header, event.contentOffset.y);
      /* Past the top is a negative offset, and the inset puts the top at
         `-headerRoom` rather than at zero. */
      pull.value = Math.max(0, -(event.contentOffset.y + headerRoom));
    },
    /* On release. The threshold is the distance the indicator takes to
       become solid, so it commits exactly when it looks committed. */
    onEndDrag: () => {
      if (pull.value >= PULL_TRIGGER) runOnJS(askForRefresh)();
    },
  });

  const settle = () => {
    runOnUI(settleHeader)(header);
  };
  /* Read from a worklet's callback, where state would be a frame late
     and could start a second load over the first. */
  const refreshingRef = useRef(false);
  const feedRef = useRef<FeedEntry[]>([]);
  const meRef = useRef<Me | null>(null);

  useEffect(() => {
    feedRef.current = feed;
    meRef.current = me;
  }, [feed, me]);

  /*
   * The cached feed, painted once on the very first mount.
   *
   * Separate from `load` and deliberately fire-and-forget: it races the
   * network on purpose and loses gracefully. If the real feed lands
   * first, `feedRef` is no longer empty and this does nothing rather
   * than replacing fresh content with old.
   */
  useEffect(() => {
    let live = true;

    void (async () => {
      const token = await storedAccessToken();
      if (!token || !live) return;

      const id = await cachedPlayerId();
      if (!id || !live) return;

      const cached = await readCache<CachedFeed>("feed", id);
      if (!cached || !live || feedRef.current.length > 0) return;

      if (cached.me) setMe((current) => current ?? cached.me);
      setFeed(cached.items);
    })().finally(() => {
      /* Hit or miss, the question has been asked and answered — so
         anything that depends on "is the feed really empty" can now
         be trusted to mean it. */
      if (live) setHydrated(true);
    });

    return () => {
      live = false;
    };
  }, []);

  /*
   * One loader, shared by arriving at the screen and by pulling it down.
   *
   * `alive` rather than a bare boolean so a pull that resolves after the
   * tab has been left does not set state on a gone screen - and so the
   * two entry points cannot drift into two slightly different loads.
   */
  const load = useCallback(async (alive: () => boolean) => {
    if (!(await storedAccessToken())) {
      if (alive()) {
        setMe(null);
        setFeed([]);
      }
      return;
    }

    /*
     * Last open's feed, painted before this one has loaded.
     *
     * The founder: "it is quite disorienting opening the app and it
     * slowly loads all of the elements and they all kinda pop down."
     * The layout is settled before the network is, and the real load
     * below overwrites it a moment later.
     *
     * Only when there is nothing on screen yet. A pull-to-refresh must
     * never replace what somebody is looking at with an older copy of
     * it, and neither must returning to the tab.
     */
    let cachedFor: string | null = null;

    try {
      const fresh = await getMe();
      if (alive()) setMe(fresh);
      cachedFor = fresh.player.id;
    } catch {
      /* Offline or mid-refresh. The cache still knows who it belongs
         to, so a feed can be painted from it even when `me` failed —
         which is the case where painting matters most. */
      if (alive()) setMe(null);
    }

    /* Its own try: the feed is the screen's headline, but a feed that
       failed must not take the locals list down with it. */
    try {
      /*
       * Silent: this reads a position we already have permission for
       * and shows no dialog to anybody who has not granted one. The
       * prompt belongs to a tap on the Nearby card, where the words
       * beside it say what it is for - iOS gives one chance at that
       * dialog forever, and spending it on a cold start spends it
       * badly. A null simply sends no coordinates, and the server
       * falls back to the player's ZIP.
       */
      const coords = await silentCoords();
      const fresh = await getFeed(coords);
      if (alive()) setFeed(fresh.items);

      /* Written after a load that worked, so the cache can only ever
         hold a feed that was real. */
      if (cachedFor)
        void writeCache("feed", cachedFor, {
          me: meRef.current,
          items: fresh.items,
        } satisfies CachedFeed);
    } catch {
      /*
       * A failed feed no longer empties the screen when there is
       * something cached to keep. Blanking a feed somebody can see
       * because the network blinked is the pop-in complaint in its
       * worst form — it removes content rather than adding it late.
       */
      if (alive() && feedRef.current.length === 0) setFeed([]);
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

  /*
   * Reload the moment something worth showing happens, rather than
   * waiting to be looked at.
   *
   * A tab screen stays mounted behind whichever tab is on top, so
   * posting a Flare and then tapping Feed used to start the fetch AT
   * the tap. The founder wanted the opposite: "when I post a flare, it
   * immediately begins a refresh on the main feed so i can click feed
   * instantly and itll already be there."
   *
   * Not a pull, so `refreshing` stays false and no spinner appears for
   * something the viewer did not ask to watch.
   */
  useEffect(() => onFeedStale(() => void load(() => true)), [load]);

  /*
   * Pull to refresh, which the most-reopened screen in the app did not
   * have. Without it there is no way to ask for new content, which
   * quietly teaches that reopening is pointless - the exact opposite of
   * what a feed is for.
   */
  const refresh = async () => {
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await load(() => true);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  };

  /**
   * The post behind a hunt, with the one call "I have this" makes.
   * After it lands the Feed reloads, so the card reads OFFERED and the
   * count under it moves without a pull.
   */
  const postRef = (item: { postId: string; yours: boolean }): PostRef => ({
    postId: item.postId,
    yours: item.yours,
    offer: async (flareId, note) => {
      await offerFromPost(item.postId, flareId, note);
      await load(() => true);
    },
  });

  /** A Feed post, in the shape both sheets read. */
  const sheetPost = (item: Extract<FeedEntry, { kind: "hunt" }>): FlareSheetPost => ({
    postId: item.postId,
    posterName: item.displayName,
    direction: item.direction ?? "want",
    yours: item.yours,
    completed: item.completed ?? false,
    cards: item.cards,
  });

  const enter = async (raw: string) => {
    await rememberRoom(raw.trim().toUpperCase());
    openRoom(navigation);
  };

  /*
   * Where a notice's button goes on a phone.
   *
   * The link is stored as a website path, because that is the one form
   * both platforms can read and the only form the database accepts. The
   * handful the app has a screen for are routed to it; anything else
   * opens the website, which is honest — the button always ends up
   * where its label said it would.
   */
  const follow = (href: string) => {
    void followHref(navigation, href).catch(() => {});
  };

  /*
   * "I'll be there", the app's way: join the early board under the
   * account's own name and post every saved want. Duplicates already on
   * the board are skipped by the server, so this is safe to repeat.
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
      openRoom(navigation);
    } catch {
      // The Room tab shows the truthful state; nothing to add here.
    } finally {
      setRsvping(null);
    }
  };

  /*
   * "I'll be there" from a store's post: the same RSVP as above, keyed
   * on the night's own code rather than on a saved local, because the
   * post names the board it is about. The card keeps its own busy
   * state, so this only has to do the joining.
   */
  const rsvpToCode = async (code: string) => {
    if (!me) return;
    await joinRoom(code, me.player.displayName);
    for (const want of me.wants) {
      await postFlare(code, {
        cardId: want.cardId,
        printingId: want.printingId,
        quantity: want.quantity,
        note: want.note ?? undefined,
        deckLabel: want.deckLabel,
      }).catch(() => {});
    }
    await rememberRoom(code);
    openRoom(navigation);
  };

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
    return "Tap to see what's happening";
  };

  return (
    <>
      {/*
       * The spinner, floating under the header. Absolute and OUTSIDE the
       * list, so it does not ride the content and cannot be clipped by
       * it. It fades and grows with the pull, then spins while the load
       * runs - the two states the platform control never gave us.
       */}
      <PullSpinner pull={pull} refreshing={refreshing} top={headerRoom} />

      <CollapsingHeader
        state={header}
        onSearch={() => navigation.navigate("FindPlayer")}
      />
      <Animated.ScrollView
        /*
         * flex: 1, and it is load-bearing rather than tidy.
         *
         * A ScrollView sizes itself to its content unless something
         * bounds it. As the screen's only child it inherited a bound;
         * once the floating header became a sibling it stopped doing
         * so, grew to the full height of the feed, and simply got
         * clipped — a screen with more content than fits and no way to
         * reach it, which looks like the list is broken rather than
         * unbounded.
         */
        style={{ flex: 1 }}
        /*
         * Without this a tap on a button is spent dismissing the keyboard
         * instead of pressing the button, and the player has to tap twice.
         * The feed had no text input until the Nearby card asked for a ZIP,
         * so it never needed the prop - the two other screens that take
         * typing, find-player and welcome, have carried it all along.
         *
         * "handled" rather than "always": a tap on empty space still
         * dismisses the keyboard, which is what people expect. Only a tap
         * something else is going to handle jumps the queue.
         */
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        onScrollEndDrag={settle}
        onMomentumScrollEnd={settle}
        /* Every frame, because the header follows the thumb rather than
           waking up at intervals behind it. */
        scrollEventThrottle={16}
        /*
         * THE HEADER'S ROOM IS AN INSET, NOT PADDING.
         *
         * iOS measures the pull-to-refresh spinner against the scroll
         * view's OWN top edge - above the content, not above the
         * content's padding - and with padding that edge sat under the
         * floating header. An inset moves the edge itself, so there is
         * somewhere visible for the spinner to sit, and the first card
         * still starts clear of the bar. The matching `contentOffset` is
         * what stops the list opening already scrolled by the inset.
         */
        contentInset={{ top: headerRoom }}
        contentOffset={{ x: 0, y: -headerRoom }}
        scrollIndicatorInsets={{ top: headerRoom }}
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
          gap: spacing(4),
          /* The tab bar floats over the other end, so the last card ends
             above it rather than under it. */
          paddingBottom: spacing(4) + tabInset,
        }}
      >
        {/*
         * NO IDENTITY HEADER. The Feed opens on the Feed.
         *
         * There was a row here - your face, your name, your want count and
         * your Embers - on the argument that a quiet week still has to open
         * with something true. The founder cut it: "it's not necessary to
         * show my username, flare points, or anything like that... to allow
         * the feed to have more vertical space."
         *
         * He is right about what it cost. Every one of those facts is about
         * the viewer, who already knows them, and they sat above the first
         * post on the screen the app opens to. The balance and the want
         * count both live on Profile, a tab away, so nothing here was the
         * only way to reach anything.
         */}

        {/* The three filters, first thing under the wordmark. */}
        <FeedFilterTabs value={tab} onChange={setTab} />

        {/*
         * The Room tab's job, as a banner: gone from the bar, never gone
         * from reach. The moment a room is open at one of your stores it
         * pins here, above everything derived, and one tap lands on the
         * board. The website's Feed wears the same banner.
         */}
        {me?.locals.some((local) => local.liveNow) && (
          <Tap
            onPress={() => {
              const live = me.locals.find((local) => local.liveNow);
              if (live) void enter(live.code);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing(3),
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.accent,
              backgroundColor: colors.elevated,
              padding: spacing(3),
            }}
          >
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: colors.accent,
              }}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{ color: colors.textPrimary, fontWeight: "700" }}
              >
                Room open at {me.locals.find((local) => local.liveNow)?.name}
              </Text>
              <Muted>Tap to jump onto the board.</Muted>
            </View>
          </Tap>
        )}

        {/*
         * The Feed leads. Everything here is derived - nobody posts to it -
         * so a pilot with six players still opens something worth reading.
         * The website's two item kinds, in the website's order: people
         * before places, because a board will still be there tomorrow and
         * somebody needing a card you are holding will not.
         */}
        {/*
         * A kind this build has never heard of draws NOTHING.
         *
         * The server ships on Vercel's clock and the app on TestFlight's, so
         * a phone meets item kinds newer than itself as a matter of routine.
         * This chain used to end in the board branch, so an unknown kind was
         * rendered AS a board - a card with an undefined title and a button
         * to an undefined room. That is how the website and the app came to
         * show different feeds the week the new kinds landed.
         */}
        {shown.map((item, index) => {
          const body =
            item.kind === "nearbyMatch" ? (
              <Card
                key={`nearby-match-${index}`}
                style={{ borderColor: `${colors.accent}66` }}
              >
                <Text
                  style={{
                    color: colors.accent,
                    fontSize: 11,
                    fontWeight: "700",
                    letterSpacing: 1.6,
                    textTransform: "uppercase",
                  }}
                >
                  You can answer a Flare
                </Text>
                <Muted>Only you see this. They hear from you when you answer.</Muted>

                <View style={{ gap: spacing(4) }}>
                  {item.matches.slice(0, 5).map((match) => (
                    <MatchRow
                      key={`${match.ask.kind}-${match.ask.id}`}
                      match={match}
                      onOpen={(threadId) =>
                        navigation.navigate("LocalThread", { threadId })
                      }
                    />
                  ))}
                </View>

                {item.matches.length > 5 ? (
                  <Muted>{`+${item.matches.length - 5} more nearby`}</Muted>
                ) : null}
              </Card>
            ) : item.kind === "wanted" ? (
              <Card
                key={`wanted-${index}`}
                style={{ borderColor: `${colors.accent}66` }}
              >
                {/* The number IS the item. It moves on its own, which is the
                whole reason to open the app again on a Tuesday. */}
                <Title>
                  {`${item.total} ${
                    item.total === 1 ? "player wants" : "players want"
                  } a card you're holding`}
                </Title>
                <Muted>Bring it and it&rsquo;s a trade. They already asked.</Muted>

                <View style={{ gap: spacing(2.5) }}>
                  {item.entries.map((entry) => (
                    <View
                      key={`${entry.playerSessionId}-${entry.card.cardId}`}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: spacing(2.5),
                      }}
                    >
                      <CardImage
                        imageUrl={entry.card.imageUrl}
                        width={44}
                        name={entry.card.cardName}
                        cardNumber={entry.card.cardNumber}
                        youHave={
                          entry.card.match
                            ? { kind: entry.card.match, count: 0 }
                            : undefined
                        }
                      />
                      {/* Whose it is. "Who do I walk over to" is half the
                      question, and a name without a face is the half of
                      it nobody recognises across a shop. */}
                      {/* The CARD leads this row, not the person: it
                      answers "which of my wants is out there", and the
                      name is how you find them once you know. So it
                      keeps its own layout — but the face still opens a
                      profile, and a guest still says so on the line
                      where the name actually appears. */}
                      <Tap
                        accessibilityLabel={`Open ${entry.displayName ?? "this player"}'s profile`}
                        disabled={!entry.playerId}
                        onPress={() =>
                          entry.playerId &&
                          navigation.navigate("PlayerProfile", {
                            playerId: entry.playerId,
                          })
                        }
                      >
                        <PlayerAvatar
                          displayName={entry.displayName ?? "A player"}
                          seed={entry.playerId ?? entry.playerSessionId}
                          avatarUrl={entry.avatarUrl}
                          frame={entry.frame}
                          ring={entry.ring}
                          aura={entry.aura}
                          size={28}
                        />
                      </Tap>
                      <View style={{ flex: 1 }}>
                        <Text
                          numberOfLines={1}
                          style={{ color: colors.textPrimary, fontWeight: "600" }}
                        >
                          {entry.card.cardName}
                        </Text>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: spacing(1.5),
                          }}
                        >
                          <Text
                            numberOfLines={1}
                            style={{
                              color: colors.textMuted,
                              fontSize: 12,
                              flexShrink: 1,
                            }}
                          >
                            {`${entry.displayName ?? "A player"} · ${entry.storeName} · ${agoFrom(entry.when)}`}
                          </Text>
                          {entry.playerId === null ? <GuestChip /> : null}
                        </View>
                      </View>
                      <Tap
                        accessibilityLabel={`Go to ${entry.storeName}`}
                        onPress={() => void enter(entry.joinCode)}
                      >
                        <Text style={{ color: colors.accent, fontWeight: "700" }}>
                          Go
                        </Text>
                      </Tap>
                    </View>
                  ))}
                </View>

                {item.total > item.entries.length ? (
                  <Muted>
                    {`+${item.total - item.entries.length} more across your stores`}
                  </Muted>
                ) : null}
              </Card>
            ) : item.kind === "storePost" ? (
              /* A store you follow, saying something. The website's card,
                 drawn natively; see store-post-card. */
              <StorePostCard
                key={`store-post-${item.postId}`}
                item={item}
                onOpenStore={(storeId) =>
                  navigation.navigate("StoreProfile", { storeId })
                }
                onLike={(liked) => likePost(item.postId, liked)}
                onOpenThread={() =>
                  navigation.navigate("FlarePost", { postId: item.postId })
                }
                onRsvp={rsvpToCode}
              />
            ) : item.kind === "announcement" ? (
              <Card key={`announcement-${index}`}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing(2),
                  }}
                >
                  {/* The mark, not a face. There is no cardflare player and
                  this is the item that has to look like it knows that. */}
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.elevated,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Image
                      source={require("../../assets/cardflare-mark.png")}
                      style={{
                        height: 20,
                        width: 20 * MARK_ASPECT,
                        resizeMode: "contain",
                      }}
                    />
                  </View>
                  <View style={{ flexShrink: 1 }}>
                    <Title>{item.headline}</Title>
                    <Muted>cardflare</Muted>
                  </View>
                </View>

                <Body>{item.body}</Body>

                {item.linkLabel && item.linkHref ? (
                  <Button
                    label={item.linkLabel}
                    variant="secondary"
                    onPress={() => follow(item.linkHref as string)}
                  />
                ) : null}
              </Card>
            ) : item.kind === "start" ? (
              <Card key={`start-${index}`}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing(2),
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.elevated,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <MaterialCommunityIcons
                      name={STARTERS[item.topic].icon}
                      size={20}
                      color={colors.accent}
                    />
                  </View>
                  <View style={{ flexShrink: 1 }}>
                    <Title>{STARTERS[item.topic].headline}</Title>
                  </View>
                </View>

                <Body>{STARTERS[item.topic].body}</Body>

                <Button
                  label={STARTERS[item.topic].label}
                  onPress={() =>
                    item.topic === "store"
                      ? openRoom(navigation)
                      : navigation.navigate("Settings")
                  }
                />
              </Card>
            ) : item.kind === "traded" ? (
              <Card key={`traded-${index}`}>
                <Body>
                  {`${item.requester} traded for ${item.cardName}${
                    item.holder ? ` with ${item.holder}` : ""
                  } at ${item.storeName}.`}
                </Body>
              </Card>
            ) : item.kind === "added" ? (
              <Card key={`added-${index}`}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing(2),
                  }}
                >
                  <FeedPerson
                    playerId={item.playerId}
                    displayName={item.displayName}
                    avatarUrl={item.avatarUrl}
                    frame={item.frame}
                    ring={item.ring}
                    detail={`added ${item.total} ${
                      item.total === 1 ? "card" : "cards"
                    } to their binder`}
                    onOpen={(id) =>
                      navigation.navigate("PlayerProfile", { playerId: id })
                    }
                  />
                </View>

                <View style={{ flexDirection: "row", gap: spacing(2) }}>
                  {item.cards.map((card) => (
                    <CardImage
                      key={card.cardId}
                      imageUrl={card.imageUrl}
                      width={48}
                      name={card.cardName}
                      cardNumber={card.cardNumber}
                      /* Ringed only when it is on YOUR list, same as the web. */
                      youHave={card.onYourList ? { kind: "exact", count: 0 } : null}
                    />
                  ))}
                </View>

                {item.onYourListCount > 0 && (
                  <Text style={{ color: colors.accent, fontWeight: "600" }}>
                    {item.onYourListCount === 1
                      ? "One of these is on your want list"
                      : `${item.onYourListCount} of these are on your want list`}
                  </Text>
                )}
              </Card>
            ) : item.kind === "suggest" ? (
              <Card key={`suggest-${index}`}>
                <Title>Worth following</Title>
                <Muted>Their binders answer what you&rsquo;re hunting.</Muted>
                {item.players.map((person) => (
                  <Tap
                    key={person.playerId}
                    onPress={() =>
                      navigation.navigate("PlayerProfile", {
                        playerId: person.playerId,
                      })
                    }
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing(2),
                    }}
                  >
                    <PlayerAvatar
                      displayName={person.displayName}
                      seed={person.playerId}
                      avatarUrl={person.avatarUrl}
                      size={36}
                    />
                    <View style={{ flexShrink: 1 }}>
                      <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
                        {person.displayName}
                      </Text>
                      {/* Always "wants": the list is plural even when the
                      overlap with it is one card. */}
                      <Muted>{`has ${person.answers} of your wants`}</Muted>
                    </View>
                  </Tap>
                ))}
              </Card>
            ) : item.kind === "hunt" ? (
              view === "compact" ? (
                /* The founder's compact view: art and a needed-count,
                   everything else a tap away. See flare-feed-card-compact. */
                <FlareFeedCardCompact
                  key={`hunt-${item.postId}`}
                  item={item}
                  post={postRef(item)}
                  onOpenProfile={(id) =>
                    navigation.navigate("PlayerProfile", { playerId: id })
                  }
                  onLike={(liked) => likePost(item.postId, liked)}
                  onOpenThread={() =>
                    navigation.navigate("FlarePost", { postId: item.postId })
                  }
                  onMessage={
                    item.yours || !item.cards[0]?.flareId
                      ? undefined
                      : () =>
                          setMessaging({
                            flareId: item.cards[0]?.flareId ?? "",
                            cardName: item.cards[0]?.cardName ?? "your card",
                            posterName: item.displayName,
                          })
                  }
                />
              ) : (
                <FlareFeedCard
                  key={`hunt-${item.postId}`}
                  item={item}
                  post={postRef(item)}
                  onOpenProfile={(id) =>
                    navigation.navigate("PlayerProfile", { playerId: id })
                  }
                  onLike={(liked) => likePost(item.postId, liked)}
                  onOpenThread={() =>
                    navigation.navigate("FlarePost", { postId: item.postId })
                  }
                  onMessage={
                    item.yours || !item.cards[0]?.flareId
                      ? undefined
                      : () =>
                          setMessaging({
                            flareId: item.cards[0]?.flareId ?? "",
                            cardName: item.cards[0]?.cardName ?? "your card",
                            posterName: item.displayName,
                          })
                  }
                  onEnterRoom={(code) => void enter(code)}
                  onOffer={
                    item.yours
                      ? undefined
                      : () => setCardsSheet({ ...sheetPost(item), mode: "offer" })
                  }
                  onViewAll={() => setCardsSheet({ ...sheetPost(item), mode: "view" })}
                  onProgress={
                    item.yours ? () => setProgressSheet(sheetPost(item)) : undefined
                  }
                  onOpenHunt={(huntId) => navigation.navigate("Hunt", { huntId })}
                />
              )
            ) : item.kind === "upcoming" ? (
              <Card key={`upcoming-${index}`}>
                <Muted>
                  {item.city ? `${item.storeName} · ${item.city}` : item.storeName}
                </Muted>
                {/* A night on the calendar is the headline. Without one the
                counter code is, because the answer is "whenever". */}
                <Title>{item.nextEventName ?? "Walk in any time"}</Title>
                <Muted>
                  {item.nextEventAt
                    ? doorsAt(item.nextEventAt, item.timeZone)
                    : "The counter code is always open"}
                </Muted>

                {item.wants > 0 ? (
                  <Body>
                    {`${item.wants} ${item.wants === 1 ? "card" : "cards"} on your want list to ask about.`}
                  </Body>
                ) : null}

                <Button
                  label={item.nextEventCode ? "See the board" : "Open the room"}
                  variant="secondary"
                  onPress={() => void enter(item.nextEventCode ?? item.joinCode)}
                />
              </Card>
            ) : item.kind === "recent" ? (
              <Card key={`recent-${item.id}`}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing(2),
                  }}
                >
                  {/* The direction in words, never a texture - PRODUCT.md
                  is explicit that foil means rare, not available. */}
                  <FeedPerson
                    playerId={item.playerId}
                    displayName={item.displayName}
                    avatarUrl={item.avatarUrl}
                    frame={item.frame}
                    ring={item.ring}
                    aura={item.aura}
                    size={36}
                    detail={`${
                      item.direction === "showcase" ? "Letting go of" : "Hunting"
                    }${item.deckLabel ? ` · ${item.deckLabel}` : ""} · ${item.storeName}`}
                    onOpen={(id) =>
                      navigation.navigate("PlayerProfile", { playerId: id })
                    }
                  />
                  <Muted>{agoFrom(item.when)}</Muted>
                </View>

                <CardRail
                  cards={item.cards}
                  more={item.more}
                  width={tileWidth(item.cards.length)}
                />

                <Button
                  label="See the board"
                  variant="secondary"
                  onPress={() => void enter(item.joinCode)}
                />
              </Card>
            ) : item.kind === "nearbyStores" ? (
              /*
               * Three states, and the two empty ones carry the feature. A
               * section that vanishes when we do not know where somebody is
               * teaches them nothing; a section that asks is how anybody
               * finds out it exists. See nearbyStoreItems on the server.
               */
              item.needsLocation ? (
                <Card key={`nearby-${index}`}>
                  <Title>Find stores near you</Title>
                  <NearbyLocationAsk onDone={() => void load(() => true)} />
                </Card>
              ) : (
                <Card key={`nearby-${index}`}>
                  <Title>Stores near you</Title>
                  <Muted>
                    Shops cardflare knows about, whether or not they use it yet.
                  </Muted>

                  {/* Known position, nothing in range. Said out loud: an empty
                list is indistinguishable from a broken one. */}
                  {item.stores.length === 0 ? (
                    <View style={{ gap: spacing(2.5) }}>
                      <Muted>
                        No stores near you yet. We&rsquo;re adding shops city by city.
                      </Muted>
                      {/* A ZIP that found nothing might simply be the wrong
                    ZIP, and this is the only place to change it. */}
                      {item.source === "postal" ? (
                        <NearbyLocationAsk onDone={() => void load(() => true)} />
                      ) : null}
                    </View>
                  ) : null}

                  <View style={{ gap: spacing(2.5) }}>
                    {item.stores.map((store) => (
                      /* Tappable, because the website has put a "View" button
                   on every one of these rows since the day the Nearby
                   card shipped and the phone showed the same shops as
                   dead text. A chevron says so without a button's
                   weight in a list of five. */
                      <Tap
                        key={store.storeId}
                        onPress={() =>
                          navigation.navigate("StoreProfile", {
                            storeId: store.storeId,
                          })
                        }
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: spacing(2),
                        }}
                      >
                        <MaterialCommunityIcons
                          name="map-marker-outline"
                          size={18}
                          color={colors.textMuted}
                        />
                        <View style={{ flex: 1 }}>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: spacing(1),
                            }}
                          >
                            <Text
                              numberOfLines={1}
                              style={{ color: colors.textPrimary, fontWeight: "600" }}
                            >
                              {store.name}
                            </Text>
                            {/* Two marks, never one inferred from the other:
                          Verified is trust, Ultra is a product tier. */}
                            {store.verified ? <VerifiedMark size={14} /> : null}
                            {store.ultra ? (
                              <Text
                                style={{
                                  color: colors.textSecondary,
                                  fontSize: 9,
                                  fontWeight: "700",
                                  letterSpacing: 0.8,
                                  borderWidth: 1,
                                  borderColor: colors.border,
                                  borderRadius: 999,
                                  paddingHorizontal: 5,
                                  paddingVertical: 1,
                                }}
                              >
                                ULTRA
                              </Text>
                            ) : null}
                          </View>
                          <Text
                            numberOfLines={1}
                            style={{ color: colors.textMuted, fontSize: 12 }}
                          >
                            {`${store.miles} mi${store.city ? ` · ${store.city}` : ""}${
                              store.unclaimed ? " · Unclaimed listing" : ""
                            }`}
                          </Text>
                        </View>
                        <MaterialCommunityIcons
                          name="chevron-right"
                          size={20}
                          color={colors.textMuted}
                        />
                      </Tap>
                    ))}
                  </View>
                </Card>
              )
            ) : item.kind === "pack" ? (
              <Card key={`pack-${index}`}>
                <Muted>In the Embers store</Muted>
                <Title>{item.name}</Title>
                <Body>{item.description}</Body>
                <Muted>
                  {item.balance >= item.priceEmbers
                    ? `${item.priceEmbers} Embers`
                    : `${item.priceEmbers} Embers · you have ${item.balance}`}
                </Muted>
                <Button
                  label={
                    item.balance >= item.priceEmbers ? "Open a pack" : "See the store"
                  }
                  variant="secondary"
                  onPress={() => navigation.navigate("Store")}
                />
              </Card>
            ) : item.kind === "shop" ? (
              <Card key={`shop-${index}`}>
                <Title>Worth spending Embers on</Title>
                <Muted>{`You have ${item.balance} to spend.`}</Muted>
                <View style={{ gap: spacing(2) }}>
                  {item.cosmetics.map((cosmetic) => (
                    <View
                      key={cosmetic.slug}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: spacing(2),
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{ color: colors.textPrimary, fontWeight: "600" }}
                          numberOfLines={1}
                        >
                          {cosmetic.name}
                        </Text>
                        <Text
                          style={{ color: colors.textMuted, fontSize: 12 }}
                          numberOfLines={1}
                        >
                          {cosmetic.description}
                        </Text>
                      </View>
                      <Muted>{`${cosmetic.costEmbers}`}</Muted>
                    </View>
                  ))}
                </View>
                <Button
                  label="See what you can wear"
                  variant="secondary"
                  onPress={() => navigation.navigate("Customize", { area: "profile" })}
                />
              </Card>
            ) : item.kind !== "board" ? null : (
              <Card key={`board-${index}`}>
                {/* A local needs no address — you drive there. A room
                somewhere you have never been needs a place attached. */}
                <Muted>
                  {item.yours || !item.city
                    ? item.storeName
                    : `${item.storeName} · ${item.city}`}
                </Muted>
                <Title>{item.eventName}</Title>
                <Muted>
                  {item.live ? "Open now" : doorsAt(item.startsAt, item.timeZone)}
                </Muted>

                {item.youCanAnswer > 0 && (
                  <>
                    <Text style={{ color: colors.accent, fontWeight: "600" }}>
                      {`You can answer ${item.youCanAnswer} ${
                        item.youCanAnswer === 1 ? "card" : "cards"
                      } on this board`}
                    </Text>
                    <View style={{ flexDirection: "row", gap: spacing(2) }}>
                      {item.sample.map((card) => (
                        <CardImage
                          key={card.cardId}
                          imageUrl={card.imageUrl}
                          width={48}
                          name={card.cardName}
                          cardNumber={card.cardNumber}
                          youHave={
                            card.match ? { kind: card.match, count: 0 } : undefined
                          }
                        />
                      ))}
                    </View>
                  </>
                )}

                <Button
                  label={item.live ? "Go to the room" : "See the board"}
                  variant="secondary"
                  onPress={() => void enter(item.code)}
                />
              </Card>
            );

          /* The heading, only where the section changes. The order was
           always an argument about what is worth a tap; this is that
           argument said out loud. */
          /*
           * A SECTION WE HAVE NO TITLE FOR DRAWS NOTHING.
           *
           * `SECTION_TITLES[item.section]` used to be read straight into
           * a <Text>. A server filing items under a section newer than
           * the app returned undefined, and an empty Text still takes a
           * line box - so the Feed opened on forty-three points of pure
           * black above the first card, with nothing in it to see or to
           * blame. Same forgiving rule the item kinds already follow.
           */
          const heading = sectionHeading(item.section);
          const opensSection =
            heading !== null &&
            sectionsShown > 1 &&
            (index === 0 || shown[index - 1].section !== item.section);

          return (
            <View key={`entry-${index}`} style={{ gap: spacing(2) }}>
              {opensSection ? (
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 12,
                    fontWeight: "600",
                    letterSpacing: 1.4,
                    textTransform: "uppercase",
                  }}
                >
                  {heading}
                </Text>
              ) : null}
              {body}
              {/* Why this is on your screen. A feed that explains itself
                stops feeling arbitrary even when it is thin. A post
                carries its own label in its header instead - the
                founder: no separate text between cards. */}
              {item.reason && item.kind !== "hunt" ? (
                <Muted>{item.reason}</Muted>
              ) : null}
            </View>
          );
        })}

        {locals.length > 0 && (
          <Card>
            {/* The MANAGING list, not the news. A saved store with a night
              on it is an "upcoming" item further up now, so this exists
              for the two things that item cannot do: say you will be
              there, and stop following a shop you no longer go to. */}
            <Title>Your locals</Title>
            <Muted>
              Stores you follow. Joining a room follows the store too. Tap one to walk
              in, no QR needed. &ldquo;I&rsquo;ll be there&rdquo; posts your wants to
              the board before you arrive.
            </Muted>
            {/* Divided rows, RSVP inside its own row - the web's list,
              exactly. The button carries the count so the tap never
              posts more than it said. */}
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
                      onPress={() => void enter(local.code)}
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
                      onPress={() => {
                        setMe((current) =>
                          current
                            ? {
                                ...current,
                                locals: current.locals.filter(
                                  (entry) => entry.storeId !== local.storeId,
                                ),
                              }
                            : current,
                        );
                        void removeLocal(local.storeId).catch(() => {});
                      }}
                      hitSlop={8}
                    >
                      <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                        Remove
                      </Text>
                    </Tap>
                  </View>

                  {local.earlyOpen && local.nextEventCode && (
                    <Button
                      label={
                        rsvping === local.storeId
                          ? "Joining the board…"
                          : me && me.wants.length > 0
                            ? `I'll be there. Post my ${me.wants.length} ${
                                me.wants.length === 1 ? "Flare" : "Flares"
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

        {/*
         * The explainer, for a screen that has not filled up yet.
         *
         * It was unconditional, which meant an established player read "how
         * it works" under their own board every time they opened the app.
         * Below three items the screen has room for it and a newcomer needs
         * it; above three it is the least interesting thing present.
         */}
        {/*
         * And not until the cache has answered. Measured on a release
         * build: the shell is up at 0.8s and the cached feed paints at
         * ~1.2s, so an unguarded empty state flashes "how it works" at
         * somebody with a full feed for a third of a second before their
         * own content replaces it. Telling a returning player they have
         * nothing, briefly, is its own kind of disorienting — which is
         * the complaint this whole change exists to answer.
         */}
        {hydrated && shown.length === 0 && tab === "following" && (
          <Card>
            <Title>Nothing from people yet</Title>
            <Body>
              Follow a friend and their Flares show up here. Find them by name from the
              search up top.
            </Body>
            <Button
              label="Find a player"
              variant="secondary"
              onPress={() => navigation.navigate("FindPlayer")}
            />
          </Card>
        )}
        {/* The restored filter needs its own words. Without them it
            fell through to Nearby's, which talks about store rooms. */}
        {hydrated && shown.length === 0 && tab === "mine" && (
          <Card>
            <Title>You have not posted yet</Title>
            <Body>
              Post a Flare for a card you are hunting and it shows up here, and in
              Following with everyone else&rsquo;s.
            </Body>
            <Button
              label="Post a Flare"
              variant="secondary"
              onPress={() => navigation.navigate("Tabs", { screen: "Flare" })}
            />
          </Card>
        )}

        {hydrated && shown.length === 0 && tab === "nearby" && (
          <Card>
            <Title>Nothing on right now</Title>
            <Body>
              Post a Flare for a card you are hunting, or follow a friend, and it shows
              up here. At a store? The code at the counter gets you into tonight&rsquo;s
              room.
            </Body>
            <Button
              label="Go to Room"
              variant="secondary"
              onPress={() => openRoom(navigation)}
            />
          </Card>
        )}

        <FlareMessageSheet
          target={messaging}
          onClose={() => setMessaging(null)}
          onOpened={(threadId) => {
            setMessaging(null);
            navigation.navigate("LocalThread", { threadId });
          }}
        />
        <FlareCardsSheet
          open={cardsSheet}
          onClose={() => setCardsSheet(null)}
          onChanged={() => void load(() => true)}
        />
        <FlareProgressSheet
          open={progressSheet}
          onClose={() => setProgressSheet(null)}
          onChanged={() => void load(() => true)}
        />

        {hydrated && feed.length < 3 && (
          <Card>
            <Title>How it works</Title>
            <Body>
              Post a Flare for the card you&rsquo;re hunting. When a friend or somebody
              in your room has it, they raise a hand and you trade in person.
            </Body>
          </Card>
        )}
      </Animated.ScrollView>
    </>
  );
}
