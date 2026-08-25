import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import Animated, {
  runOnUI,
  useAnimatedScrollHandler,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";

import type { StackParams } from "../../App";
import {
  getFeed,
  SECTION_TITLES,
  type FeedEntry,
  getMe,
  joinRoom,
  postFlare,
  rememberRoom,
  removeLocal,
  storedAccessToken,
  type Me,
} from "../api";
import { Body, Button, Card, CardImage, Muted, Tap, Title } from "../ui";
import { silentCoords } from "../location";
import { FeedPerson, GuestChip } from "../feed-person";
import { cachedPlayerId, readCache, writeCache } from "../cache";
import {
  CollapsingHeader,
  HEADER_CONTENT_HEIGHT,
  onHeaderScroll,
  settleHeader,
  useHeaderScroll,
} from "../collapsing-header";
import { NearbyLocationAsk } from "../nearby-location-ask";
import { EmberBadge } from "../ember-badge";
import { PlayerAvatar } from "../player-avatar";
import { API_BASE } from "../config";
import { colors, spacing } from "../theme";

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
 * The things a player can always do, whatever the room is doing.
 *
 * The founder, on opening the app and finding nothing: "the app should
 * have a great home menu with lots of call to actions or stuff to look
 * at". These are the call to actions - a fixed row that does not depend
 * on anybody else having posted anything, which is the whole trouble
 * with a feed on a quiet week.
 *
 * SCANNING IS DELIBERATELY NOT HERE. The first cut of this row had it,
 * and it walked straight back into a decision the founder already made:
 * "move the qr code scanner/code entry to Room. No need to have that in
 * the feed." Scanning is what you do standing at a counter, which is the
 * moment you are opening Room anyway. Three doors that go somewhere you
 * cannot otherwise reach in a tap beats four with one in the wrong wall.
 */
const ACTIONS = [
  { key: "wants", icon: "clipboard-list-outline", label: "Your wants" },
  { key: "store", icon: "fire", label: "Embers store" },
  { key: "dress", icon: "auto-fix", label: "Customize" },
] as const;

/**
 * How wide a card is drawn, given how many are in the row.
 *
 * The founder, looking at a lone Flare in the deployed feed: "it looks a
 * little silly to have one single card on a thing." He was right - a
 * thumbnail the size of a thumbnail, marooned in a full-width card, reads
 * as a mistake rather than as one card.
 *
 * The art carries the weight of what is in the row. One card gets a
 * picture worth looking at; two or three get something in between; a deck
 * goes back to a strip, because at that point the row is about the SIZE of
 * the hunt rather than about any one card in it.
 *
 * The same three numbers as the website's, pinned together by
 * tests/unit/app-feed-parity.test.ts: one product, one set of sizes.
 */
function tileWidth(count: number): number {
  if (count <= 1) return 160;
  if (count <= 3) return 96;
  return 48;
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
  const header = useHeaderScroll();

  const onScroll = useAnimatedScrollHandler((event) => {
    onHeaderScroll(header, event.contentOffset.y);
  });

  const settle = () => {
    runOnUI(settleHeader)(header);
  };
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
   * Pull to refresh, which the most-reopened screen in the app did not
   * have. Without it there is no way to ask for new content, which
   * quietly teaches that reopening is pointless - the exact opposite of
   * what a feed is for.
   */
  const refresh = async () => {
    setRefreshing(true);
    try {
      await load(() => true);
    } finally {
      setRefreshing(false);
    }
  };

  const enter = async (raw: string) => {
    await rememberRoom(raw.trim().toUpperCase());
    navigation.navigate("Room");
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
    if (href.startsWith("/e/")) {
      void enter(href.slice(3));
      return;
    }
    if (href === "/room") {
      navigation.navigate("Room");
      return;
    }
    if (href === "/local") {
      navigation.navigate("Tabs", { screen: "Local" });
      return;
    }
    if (href === "/profile/settings") {
      navigation.navigate("Settings");
      return;
    }
    if (href === "/profile") {
      navigation.navigate("Tabs", { screen: "Profile" });
      return;
    }
    if (href === "/feed") {
      navigation.navigate("Tabs", { screen: "Feed" });
      return;
    }
    void Linking.openURL(`${API_BASE}${href}`).catch(() => {});
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
      navigation.navigate("Room");
    } catch {
      // The Room tab shows the truthful state; nothing to add here.
    } finally {
      setRsvping(null);
    }
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
        contentContainerStyle={{
          padding: spacing(4),
          gap: spacing(4),
          /* The header floats over the list, so the first card starts
             below it rather than under it. */
          paddingTop: insets.top + HEADER_CONTENT_HEIGHT + spacing(4),
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={colors.textMuted}
            /* The spinner hangs below the bar, not behind it. */
            progressViewOffset={insets.top + HEADER_CONTENT_HEIGHT}
          />
        }
      >
      {/*
       * Who you are and what you have, before anything derived.
       *
       * The Feed can be short - on a quiet week it should be - and the
       * screen still has to open with something that is true. A name and
       * a balance are true every time, and the balance is what makes the
       * two evergreen items at the bottom mean anything.
       */}
      {me && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing(3),
          }}
        >
          <PlayerAvatar
            displayName={me.player.displayName}
            seed={me.player.id}
            avatarUrl={me.player.avatarUrl ?? null}
            size={44}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 17 }}
              numberOfLines={1}
            >
              {me.player.displayName}
            </Text>
            <Muted>
              {me.wants.length > 0
                ? `${me.wants.length} ${me.wants.length === 1 ? "card" : "cards"} on your want list`
                : "No wants saved yet"}
            </Muted>
          </View>
          {/*
           * ONLY when the server actually said a number.
           *
           * `?? 0` was worse than nothing: against a server that has not
           * deployed this field yet - which is every TestFlight build
           * that ships ahead of a web release - it drew a confident
           * "0 Embers" at a player holding 8,760. A missing balance is
           * not a zero balance, and the honest render of "I do not know"
           * is to say nothing.
           */}
          {typeof me.player.embersBalance === "number" && (
            <EmberBadge earned={me.player.embersBalance} size="md" />
          )}
        </View>
      )}

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

      {/* The call to actions. Always here, always the same four. */}
      <View style={{ flexDirection: "row", gap: spacing(2) }}>
        {ACTIONS.map((action) => (
          /*
           * The flex lives on a wrapper, not on the Tap.
           *
           * `Tap` hands its `style` to the Animated.View INSIDE the
           * Pressable, so `flex: 1` there sizes a child of a box that is
           * still sizing itself to its content - the row came out half
           * the width of the cards under it, left-aligned. Wrapping is
           * the local fix; moving the style onto the Pressable would
           * change every Tap in the app to fix one row.
           */
          <View key={action.key} style={{ flex: 1 }}>
            <Tap
              accessibilityLabel={action.label}
              onPress={() => {
                if (action.key === "wants") navigation.navigate("Settings");
                else if (action.key === "store") navigation.navigate("Store");
                else navigation.navigate("Customize", { area: "profile" });
              }}
              style={{
                gap: spacing(1),
                alignItems: "center",
                paddingVertical: spacing(3),
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.elevated,
              }}
            >
              <MaterialCommunityIcons
                name={action.icon}
                size={22}
                color={colors.accent}
              />
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 11,
                  textAlign: "center",
                }}
                numberOfLines={2}
              >
                {action.label}
              </Text>
            </Tap>
          </View>
        ))}
      </View>

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
      {feed.map((item, index) => {
        const body =
        item.kind === "wanted" ? (
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
                        style={{ color: colors.textMuted, fontSize: 12, flexShrink: 1 }}
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
                    <Text style={{ color: colors.accent, fontWeight: "700" }}>Go</Text>
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
        ) : item.kind === "announcement" ? (
          <Card key={`announcement-${index}`}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
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
                  style={{ height: 20, width: 20 * MARK_ASPECT, resizeMode: "contain" }}
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
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
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
                  ? navigation.navigate("Room")
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
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
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
                onOpen={(id) => navigation.navigate("PlayerProfile", { playerId: id })}
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
                  navigation.navigate("PlayerProfile", { playerId: person.playerId })
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
          <Card key={`hunt-${index}`}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
            >
              <FeedPerson
                playerId={item.playerId}
                displayName={item.displayName}
                avatarUrl={item.avatarUrl}
                frame={item.frame}
                ring={item.ring}
                detail={`${
                  item.total === 1 ? "is hunting" : `is hunting ${item.total} cards`
                }${item.deckLabel ? ` · ${item.deckLabel}` : ""} · ${item.eventName}`}
                onOpen={(id) => navigation.navigate("PlayerProfile", { playerId: id })}
              />
            </View>

            {/* One card reads as a card; a deck reads as a row of them.
                A player posting thirty cards is one thing that happened,
                not thirty — the founder's rule for the whole Feed. */}
            {item.total === 1 && item.cards[0] ? (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
              >
                <CardImage
                  imageUrl={item.cards[0].imageUrl}
                  width={56}
                  name={item.cards[0].cardName}
                  cardNumber={item.cards[0].cardNumber}
                  youHave={
                    item.cards[0].match
                      ? { kind: item.cards[0].match, count: 0 }
                      : undefined
                  }
                />
                <View style={{ flexShrink: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
                    {item.cards[0].cardName}
                  </Text>
                  <Muted>{item.cards[0].cardNumber}</Muted>
                  {item.cards[0].match ? (
                    <Text style={{ color: colors.accent, fontWeight: "600" }}>
                      {item.cards[0].match === "exact"
                        ? "You have this"
                        : "You have another printing"}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : (
              <View style={{ gap: spacing(2) }}>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(2) }}
                >
                  {item.cards.map((card) => (
                    <CardImage
                      key={card.cardId}
                      imageUrl={card.imageUrl}
                      width={48}
                      name={card.cardName}
                      cardNumber={card.cardNumber}
                      youHave={card.match ? { kind: card.match, count: 0 } : undefined}
                    />
                  ))}
                  {item.total > item.cards.length ? (
                    <Muted>{`+${item.total - item.cards.length} more`}</Muted>
                  ) : null}
                </View>
                {item.youCanAnswer > 0 ? (
                  <Text style={{ color: colors.accent, fontWeight: "600" }}>
                    {`You can answer ${item.youCanAnswer} of ${item.total}`}
                  </Text>
                ) : null}
              </View>
            )}

            {/* Every item ends in a place and a time. */}
            <Button
              label={`Go to ${item.storeName}`}
              onPress={() => void enter(item.code)}
            />
          </Card>
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
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
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
                onOpen={(id) => navigation.navigate("PlayerProfile", { playerId: id })}
              />
              <Muted>{agoFrom(item.when)}</Muted>
            </View>

            <View
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
            >
              {item.cards.map((card) => (
                <CardImage
                  key={card.cardId}
                  imageUrl={card.imageUrl}
                  width={tileWidth(item.cards.length + item.more)}
                  name={card.cardName}
                  cardNumber={card.cardNumber}
                  youHave={card.match ? { kind: card.match, count: 0 } : undefined}
                />
              ))}
              {item.more > 0 ? <Muted>{`+${item.more} more`}</Muted> : null}
            </View>

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
                    navigation.navigate("StoreProfile", { storeId: store.storeId })
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
                      {store.verified ? (
                        <MaterialCommunityIcons
                          name="check-decagram"
                          size={14}
                          color={colors.accent}
                        />
                      ) : null}
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
              label={item.balance >= item.priceEmbers ? "Open a pack" : "See the store"}
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
                      youHave={card.match ? { kind: card.match, count: 0 } : undefined}
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
        const opensSection =
          item.section !== undefined &&
          (index === 0 || feed[index - 1].section !== item.section);

        return (
          <View key={`entry-${index}`} style={{ gap: spacing(2) }}>
            {opensSection && item.section ? (
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 12,
                  fontWeight: "600",
                  letterSpacing: 1.4,
                  textTransform: "uppercase",
                  marginTop: spacing(1),
                }}
              >
                {SECTION_TITLES[item.section]}
              </Text>
            ) : null}
            {body}
            {/* Why this is on your screen. A feed that explains itself
                stops feeling arbitrary even when it is thin. */}
            {item.reason ? <Muted>{item.reason}</Muted> : null}
          </View>
        );
      })}

      {locals.length > 0 && (
        <Card>
          {/* The MANAGING list, not the news. A saved store with a night
              on it is an "upcoming" item further up now, so this exists
              for the two things that item cannot do: say you will be
              there, and stop following a shop you no longer go to. */}
          <Title>Stores you&rsquo;ve saved</Title>
          <Muted>
            Tap one to walk in, no QR needed. &ldquo;I&rsquo;ll be there&rdquo; posts
            your wants to the board before you arrive.
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
      {hydrated && feed.length < 3 && (
        <Card>
          <Title>How it works</Title>
          <Body>
            Post a Flare for the card you&rsquo;re hunting. When somebody in the room
            has it, they raise a hand, and you go trade, in person, at the table.
          </Body>
        </Card>
      )}
      </Animated.ScrollView>
    </>
  );
}
