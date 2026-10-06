import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import {
  searchCards,
  searchPlayersByName,
  searchStores,
  type CardHit,
  type FoundPlayer,
  type FoundStore,
} from "../api";
import { displayCardName } from "../card-name";
import { gameShortName } from "../games";
import { useTabBarInset } from "../glass";
import { formatHandle } from "../handle";
import { PlayerAvatar } from "../player-avatar";
import { withRecent } from "../recent-search-list";
import { readRecent, writeRecent } from "../recent-searches";
import { RemoteImage } from "../remote-image";
import {
  SEARCH_TABS,
  TOP_LIMITS,
  matchScore,
  rankBy,
  readQuery,
  topOrder,
  type SearchTab,
  type TopSection,
} from "../search-rank";
import { Input, Muted, Tap } from "../ui";
import { colors, gutter, radius, spacing } from "../theme";
import { VerifiedMark } from "../verified-mark";

/**
 * One search for everything: the Search tab, fourth in the bar.
 *
 * This began as "Find a player": the founder, "the social features
 * should be a litle more front and center... let's make a search icon
 * in the top right of the main feed." Now the same door finds a card,
 * a player or a store, and it is a tab of its own (Feed, Nights,
 * Messages, Search, Profile) on both platforms. The website's `EverythingSearch`
 * (src/components/feed/everything-search.tsx) is the same thing with
 * the same words; tests/unit/search-parity.test.ts holds them together.
 *
 * Four tabs under the field: Top, Players, Cards, Stores (SEARCH_TABS,
 * shared with the website). The founder: "When I search for someone
 * named Luffy as a username, a bunch of Luffy cards pop up, with the
 * username being all the way at the bottom." So every list is ranked
 * by how well it matches (src/search-rank.ts: players by name and
 * handle, stores by name, cards by name and number), and Top puts a
 * player or store whose name IS the search, or starts with it, above
 * the cards. Top shows a few of each (TOP_LIMITS) with "See all", which
 * opens that tab. A search starting "@" asks for players and nothing
 * else.
 *
 * Before anything is typed, the recent searches on this phone, newest
 * first, with a Clear. A search is remembered when a result is opened
 * or the keyboard's Search is pressed, so half-typed words never fill
 * the list.
 *
 * The asks go out at once and the slowest one does not hold the others
 * back: a section lands as its answer does. Debounced, and guarded
 * against answers landing out of order, because shop wifi is slow
 * enough that the third keystroke can beat the first.
 */

/** How long typing must pause before the search goes, in milliseconds. */
export const SEARCH_DEBOUNCE_MS = 250;

/** Fewer characters than this and nothing is asked. */
export const SEARCH_MIN_CHARS = 2;

interface Results {
  /** What was asked, without the "@", for Top's order. */
  text: string;
  cards: CardHit[];
  players: FoundPlayer[];
  stores: FoundStore[];
  /** Searches still out. "Nothing for that yet." waits for zero. */
  pending: number;
  /** Which search these answers belong to. */
  request: number;
}

const NOTHING_YET: Omit<Results, "text" | "request"> = {
  cards: [],
  players: [],
  stores: [],
  pending: 3,
};

/** The art a card search row leads with: the base printing's, else the first's. */
export function leadArt(card: CardHit): string | null {
  const base = card.printings.find((printing) => printing.id === card.basePrintingId);
  return base?.imageUrl ?? card.printings[0]?.imageUrl ?? null;
}

/* How each kind is matched: players by name and handle, stores by
   name, cards by name and number. */
const playerScore = (text: string) => (person: FoundPlayer) =>
  matchScore(text, [person.displayName, person.handle]);
const storeScore = (text: string) => (store: FoundStore) =>
  matchScore(text, [store.name]);
const cardScore = (text: string) => (card: CardHit) =>
  matchScore(text, [card.name, card.cardNumber]);

const best = <T,>(items: readonly T[], score: (item: T) => number) =>
  items.reduce((top, item) => Math.max(top, score(item)), 0);

export function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  /* A tab now, so the floating bar sits over the bottom of the list. */
  const tabInset = useTabBarInset();
  const [query, setQuery] = useState("");
  /* Null until a search has run: before typing, nothing is said. */
  const [found, setFound] = useState<Results | null>(null);
  const [tab, setTab] = useState<SearchTab>("top");
  const [recent, setRecent] = useState<string[]>([]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  /* This phone's recent searches, for this account. */
  useEffect(() => {
    let live = true;
    void readRecent().then((list) => {
      if (live) setRecent(list);
    });
    return () => {
      live = false;
    };
  }, []);

  const { playersOnly } = readQuery(query);
  /* "@" is a players search, whichever tab was open. */
  const shown: SearchTab = playersOnly ? "players" : tab;

  const searchFor = (raw: string) => {
    if (timer.current) clearTimeout(timer.current);

    const { text: trimmed, playersOnly: onlyPlayers } = readQuery(raw);
    if (trimmed.length < SEARCH_MIN_CHARS) {
      latest.current += 1;
      setFound(null);
      return;
    }

    const request = ++latest.current;
    timer.current = setTimeout(() => {
      /* Each section lands as its answer does, ranked as it lands; a
         failed one is an empty one. The "nothing" line waits until all
         three are in, so a fast empty answer never says nothing while
         a slow full one is still coming. Until a section's new answer
         lands, the last search's rows stay up: typing one more letter
         never blanks the list and redraws it. */
      const settle = <K extends "cards" | "players" | "stores">(
        key: K,
        rows: Promise<Results[K]>,
      ) => {
        rows
          .catch(() => [] as Results[K])
          .then((value) => {
            if (latest.current !== request) return;
            setFound((current) => {
              const base =
                current?.request === request
                  ? current
                  : {
                      ...NOTHING_YET,
                      ...(current
                        ? {
                            cards: current.cards,
                            players: current.players,
                            stores: current.stores,
                          }
                        : {}),
                      text: trimmed,
                      request,
                    };
              return { ...base, [key]: value, pending: base.pending - 1 };
            });
          });
      };
      settle(
        "cards",
        onlyPlayers
          ? Promise.resolve([])
          : searchCards(trimmed).then((result) =>
              rankBy(result.cards, cardScore(trimmed)),
            ),
      );
      settle(
        "players",
        searchPlayersByName(trimmed).then((result) =>
          rankBy(result.players, playerScore(trimmed)),
        ),
      );
      settle(
        "stores",
        onlyPlayers
          ? Promise.resolve([])
          : searchStores(trimmed).then((result) =>
              rankBy(result.stores, storeScore(trimmed)),
            ),
      );
    }, SEARCH_DEBOUNCE_MS);
  };

  const type = (text: string) => {
    setQuery(text);
    searchFor(text);
  };

  const remember = (value: string) => {
    const next = withRecent(recent, value);
    setRecent(next);
    void writeRecent(next);
  };

  const clearRecent = () => {
    setRecent([]);
    void writeRecent([]);
  };

  /* The sections a tab draws, in order, and how many rows of each. */
  const sections: { kind: TopSection; limit?: number }[] =
    shown === "top"
      ? found
        ? topOrder(
            best(found.players, playerScore(found.text)),
            best(found.stores, storeScore(found.text)),
          ).map((kind) => ({ kind, limit: TOP_LIMITS[kind] }))
        : []
      : [{ kind: shown }];

  const nothing =
    found !== null &&
    found.pending === 0 &&
    /* The last search said nothing, but a newer one is still out. */
    found.text === readQuery(query).text &&
    sections.every(({ kind }) => found[kind].length === 0);

  const typing = query.trim() !== "";

  /** One section, or nothing when it has no rows. */
  const section = (kind: TopSection, limit?: number) => {
    if (!found) return null;
    const more =
      limit !== undefined && found[kind].length > limit
        ? () => setTab(kind)
        : undefined;
    const top = shown === "top";
    /* Opening a result remembers the search that found it. */
    const open = (go: () => void) => () => {
      remember(query);
      go();
    };

    switch (kind) {
      case "cards":
        return found && found.cards.length > 0 ? (
          <Section key={kind} heading="Cards" visible={top} onSeeAll={more}>
            {found.cards.slice(0, limit).map((card, index) => (
              <Row
                key={card.id}
                first={index === 0}
                label={`Open ${card.name}`}
                onPress={open(() => navigation.navigate("Card", { cardId: card.id }))}
              >
                <View
                  style={{
                    width: 32,
                    height: 45,
                    borderRadius: 4,
                    borderWidth: 1,
                    borderColor: colors.border,
                    overflow: "hidden",
                    backgroundColor: colors.surface,
                  }}
                >
                  <RemoteImage
                    uri={leadArt(card)}
                    style={{ width: "100%", height: "100%" }}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.textPrimary, fontWeight: "600" }}
                  >
                    {displayCardName(card.name, card.cardNumber)}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.textMuted, fontSize: 12 }}
                  >
                    {card.game
                      ? `${card.cardNumber} · ${gameShortName(card.game)}`
                      : card.cardNumber}
                  </Text>
                </View>
              </Row>
            ))}
          </Section>
        ) : null;

      case "players":
        return found && found.players.length > 0 ? (
          <Section key={kind} heading="Players" visible={top} onSeeAll={more}>
            {found.players.slice(0, limit).map((person, index) => (
              <Row
                key={person.playerId}
                first={index === 0}
                label={`Open ${person.displayName}'s profile`}
                onPress={open(() =>
                  navigation.navigate("PlayerProfile", { playerId: person.playerId }),
                )}
              >
                <PlayerAvatar
                  displayName={person.displayName}
                  seed={person.playerId}
                  avatarUrl={person.avatarUrl}
                  frame={person.frame}
                  size={32}
                />
                {/* Both, because a result list is exactly where two people
                    called Zach turn up together and the handle is the only
                    thing that tells them apart. */}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.textPrimary, fontWeight: "600" }}
                  >
                    {person.displayName}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.textMuted, fontSize: 12 }}
                  >
                    {formatHandle(person.handle)}
                  </Text>
                </View>
              </Row>
            ))}
          </Section>
        ) : null;

      case "stores":
        return found && found.stores.length > 0 ? (
          <Section key={kind} heading="Stores" visible={top} onSeeAll={more}>
            {found.stores.slice(0, limit).map((store, index) => (
              <Row
                key={store.storeId}
                first={index === 0}
                label={`Open ${store.name}`}
                onPress={open(() =>
                  navigation.navigate("StoreProfile", { storeId: store.storeId }),
                )}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
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
                        color: colors.textPrimary,
                        fontWeight: "600",
                        flexShrink: 1,
                      }}
                    >
                      {store.name}
                    </Text>
                    {store.verified ? <VerifiedMark size={14} /> : null}
                  </View>
                  {store.city || store.region ? (
                    <Text
                      numberOfLines={1}
                      style={{ color: colors.textMuted, fontSize: 12 }}
                    >
                      {[store.city, store.region].filter(Boolean).join(", ")}
                    </Text>
                  ) : null}
                </View>
              </Row>
            ))}
          </Section>
        ) : null;
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{
        paddingHorizontal: gutter,
        paddingTop: spacing(4),
        paddingBottom: spacing(4) + tabInset,
        gap: spacing(3),
      }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {/* No heading: the navigation bar above already says "Search",
          and saying it twice is how a screen looks unfinished. */}
      <Input
        value={query}
        onChangeText={type}
        placeholder="Search cards, players and stores"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        returnKeyType="search"
        onSubmitEditing={() => {
          if (readQuery(query).text.length >= SEARCH_MIN_CHARS) remember(query);
        }}
      />

      {/* Before typing: what this phone searched for last. */}
      {!typing && recent.length > 0 ? (
        <View style={{ gap: spacing(1) }}>
          <SectionHead heading="Recent" action="Clear" onAction={clearRecent} />
          <View style={rowsBox}>
            {recent.map((item, index) => (
              <Row
                key={item}
                first={index === 0}
                label={`Search ${item}`}
                onPress={() => type(item)}
              >
                <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, minWidth: 0, color: colors.textPrimary }}
                >
                  {item}
                </Text>
              </Row>
            ))}
          </View>
        </View>
      ) : null}

      {/* Top · Players · Cards · Stores, once there is something to sort. */}
      {typing ? (
        <View
          accessibilityRole="tablist"
          style={{
            flexDirection: "row",
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          {SEARCH_TABS.map(({ id, label }) => {
            const on = shown === id;
            const off = playersOnly && id !== "players";
            return (
              <Pressable
                key={id}
                onPress={() => setTab(id)}
                disabled={off}
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected: on, disabled: off }}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: spacing(2),
                  marginBottom: -1,
                  borderBottomWidth: 2,
                  borderBottomColor: on ? colors.accent : "transparent",
                  opacity: off ? 0.4 : 1,
                }}
              >
                <Text
                  style={{
                    color: on ? colors.textPrimary : colors.textMuted,
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {nothing ? <Muted>Nothing for that yet.</Muted> : null}

      {sections.map(({ kind, limit }) => section(kind, limit))}
    </ScrollView>
  );
}

/** The bordered box a list of rows sits in. */
const rowsBox = {
  borderRadius: radius.control,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.surface,
  paddingHorizontal: spacing(3),
} as const;

/** A section's heading, and the one text button at its end when it has one. */
function SectionHead({
  heading,
  action,
  onAction,
}: {
  heading: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing(3),
      }}
    >
      <Text
        accessibilityRole="header"
        style={{
          color: colors.textMuted,
          fontSize: 12,
          fontWeight: "700",
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        {heading}
      </Text>
      {action && onAction ? (
        <Tap onPress={onAction} hitSlop={8} accessibilityLabel={action}>
          <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "600" }}>
            {action}
          </Text>
        </Tap>
      ) : null}
    </View>
  );
}

/**
 * One section of results: the heading, its rows, and "See all" when Top
 * is holding some back. The heading is drawn on Top only; under a tab it
 * would repeat the tab's own name.
 */
function Section({
  heading,
  visible,
  onSeeAll,
  children,
}: {
  heading: string;
  visible: boolean;
  onSeeAll?: () => void;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: spacing(1) }}>
      {visible ? (
        <SectionHead heading={heading} action="See all" onAction={onSeeAll} />
      ) : null}
      <View style={rowsBox}>{children}</View>
    </View>
  );
}

/** A result row: a tap, a hairline above every row but the first. */
function Row({
  first,
  label,
  onPress,
  children,
}: {
  first: boolean;
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(3),
        paddingVertical: spacing(2.5),
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      {children}
    </Tap>
  );
}
