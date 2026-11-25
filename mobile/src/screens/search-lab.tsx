import { Ionicons } from "@expo/vector-icons";
import { FlaredMark } from "../flared-mark";
import { cardFlared, useMyFlares } from "../my-flares";
import { useTabReset } from "../tab-reset";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from "react-native";

import type { StackParams } from "../../App";
import {
  lastSearchGame,
  rememberSearchGame,
  searchCards,
  searchPlayersByName,
  searchStores,
  type CardHit,
  type FoundPlayer,
  type FoundStore,
} from "../api";
import { displayCardName } from "../card-name";
import { gameShortName, type GameSlug } from "../games";
import { useTabBarInset } from "../glass";
import { formatHandle } from "../handle";
import { PlayerAvatar } from "../player-avatar";
import type { RecentCard } from "../recent-card-list";
import { clearRecentCards, readRecentCards, rememberCard } from "../recent-cards";
import { RemoteImage } from "../remote-image";
import {
  LAB_GAMES,
  labScope,
  noCardsLine,
  type LabGame,
} from "../search-lab-games";
import { leadArt, SEARCH_DEBOUNCE_MS } from "./search";
import { Tap } from "../ui";
import { colors, gutter, radius, spacing } from "../theme";

/**
 * SEARCH, the UI experiment's version (src/ui-experiment.ts). The Search
 * tab draws this instead of screens/search.tsx only while the
 * experiment is on.
 *
 * Built for finding a card: one big field, the games as chips under it,
 * and, before anything is typed, the cards you opened lately and a
 * tile per game. Results are artwork first, three across, every
 * printing kept apart (a result is a CARD; its printings are counted
 * under it and chosen on the card page, never merged into one trade
 * object). Players and stores that match still come back, below the
 * cards, so nothing the old Search found is lost.
 *
 * Every number on screen is the server's: the catalogue search
 * (`GET /api/v1/cards`, which already takes `game`), the player and
 * store searches. Nothing here is sample data.
 */

const ASPECT = 88 / 63;
const GRID_GAP = spacing(2.5);

/*
 * Each game's own logo, in cardflare's green: the founder, "the icons for
 * lorcana and other tcgs on this screen should just be the logo of the
 * actual game, with the classic cardflare green as the logo color."
 * Made from the logos Wikipedia and Wikimedia Commons host, recoloured
 * offline to the accent (#cefc84): a one-colour logo flat, a many-colour
 * one as a green duotone so its outlines stay legible. Riftbound (Riot's
 * own lockup) and Gundam (Scrydex's copy of Bandai's, enlarged with its
 * edge re-sharpened) are flat green; the founder found the plain-name
 * tiles "awful" (2026-11-25).
 */
const GAME_LOGO: Partial<Record<GameSlug, ImageSourcePropType>> = {
  "one-piece": require("../../assets/games/one-piece.png"),
  pokemon: require("../../assets/games/pokemon.png"),
  mtg: require("../../assets/games/mtg.png"),
  lorcana: require("../../assets/games/lorcana.png"),
  "flesh-and-blood": require("../../assets/games/flesh-and-blood.png"),
  riftbound: require("../../assets/games/riftbound.png"),
  gundam: require("../../assets/games/gundam.png"),
};

type Answer<T> =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error" }
  | { state: "done"; items: T[] };

export function SearchLabScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const tabInset = useTabBarInset();
  const { width } = useWindowDimensions();
  const field = useRef<TextInput>(null);

  const [query, setQuery] = useState("");
  const [game, setGame] = useState<GameSlug | null>(null);
  const [cards, setCards] = useState<Answer<CardHit>>({ state: "idle" });
  const [players, setPlayers] = useState<FoundPlayer[]>([]);
  const [stores, setStores] = useState<FoundStore[]>([]);
  const [recent, setRecent] = useState<RecentCard[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  /* Only the newest answer lands: shop wifi lets keystrokes overtake. */
  const asked = useRef(0);
  /* Tapping Search again: the search as if just opened - nothing typed,
     All games, at the top, keyboard down (tab-reset.ts). */
  const page = useRef<ScrollView>(null);
  useTabReset(() => {
    setQuery("");
    setGame(null);
    /* Kept, so the next open is All too, not the game picked before. */
    void rememberSearchGame("all");
    field.current?.blur();
    page.current?.scrollTo({ y: 0, animated: true });
  });

  const text = query.trim();
  const searching = text.length >= 2;
  const tile = Math.floor((width - gutter * 2 - GRID_GAP * 2) / 3);

  useEffect(() => {
    void readRecentCards().then(setRecent);
    void lastSearchGame().then((stored) => setGame(labScope(stored)));
  }, []);

  const run = useCallback(async (words: string, scope: GameSlug | null) => {
    const ticket = ++asked.current;
    setCards({ state: "loading" });
    const [found, people, places] = await Promise.allSettled([
      searchCards(words, scope),
      searchPlayersByName(words),
      searchStores(words),
    ]);
    if (ticket !== asked.current) return;
    setCards(
      found.status === "fulfilled"
        ? { state: "done", items: found.value.cards }
        : { state: "error" },
    );
    setPlayers(people.status === "fulfilled" ? people.value.players.slice(0, 3) : []);
    setStores(places.status === "fulfilled" ? places.value.stores.slice(0, 3) : []);
  }, []);

  useEffect(() => {
    if (!searching) {
      asked.current += 1;
      setCards({ state: "idle" });
      setPlayers([]);
      setStores([]);
      return;
    }
    const timer = setTimeout(() => void run(text, game), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, game, searching, run]);

  const choose = (next: GameSlug | null) => {
    setGame(next);
    void rememberSearchGame(next ?? "all");
  };

  const open = (card: RecentCard) => {
    void rememberCard(card).then(setRecent);
    navigation.navigate("Card", { cardId: card.cardId });
  };


  const refresh = async () => {
    setRefreshing(true);
    if (searching) await run(text, game);
    else setRecent(await readRecentCards());
    setRefreshing(false);
  };

  return (
    <ScrollView
      ref={page}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{
        paddingTop: spacing(3),
        paddingBottom: spacing(6) + tabInset,
        gap: spacing(5),
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          tintColor={colors.accent}
        />
      }
    >
      {/* The field: big, the one thing on the screen you came for. */}
      <View style={{ paddingHorizontal: gutter, gap: spacing(3) }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing(2.5),
            height: 54,
            paddingHorizontal: spacing(4),
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: text ? colors.accent : colors.borderStrong,
            backgroundColor: colors.elevated,
          }}
        >
          <Ionicons
            name="search"
            size={20}
            color={text ? colors.accent : colors.textSecondary}
          />
          <TextInput
            ref={field}
            value={query}
            onChangeText={setQuery}
            placeholder="Find your next card..."
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Search cards, players and stores"
            style={{
              flex: 1,
              color: colors.textPrimary,
              fontSize: 17,
              fontWeight: "600",
            }}
          />
          {query ? (
            <Tap
              onPress={() => setQuery("")}
              hitSlop={10}
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </Tap>
          ) : null}
        </View>
      </View>

      <GameChips game={game} onChoose={choose} />

      {searching ? (
        <Results
          answer={cards}
          tile={tile}
          query={text}
          game={game}
          players={players}
          stores={stores}
          onOpen={open}
          onAllGames={() => choose(null)}
          onRetry={() => void run(text, game)}
          onPlayer={(playerId) => navigation.navigate("PlayerProfile", { playerId })}
          onStore={(storeId) => navigation.navigate("StoreProfile", { storeId })}
        />
      ) : (
        <>
          {recent.length > 0 ? (
            <View style={{ gap: spacing(3) }}>
              <Heading
                title="Recently viewed"
                action="Clear"
                onAction={() => {
                  void clearRecentCards();
                  setRecent([]);
                }}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: gutter, gap: spacing(3) }}
              >
                {recent.map((card) => (
                  <Tap
                    key={card.cardId}
                    onPress={() => open(card)}
                    accessibilityLabel={`Open ${card.name}`}
                    style={{ width: 104, gap: spacing(1.5) }}
                  >
                    <Art uri={card.imageUrl} width={104} name={card.name} />
                    <Text numberOfLines={1} style={tileName()}>
                      {displayCardName(card.name, card.cardNumber)}
                    </Text>
                    <Text numberOfLines={1} style={tileMeta()}>
                      {card.cardNumber}
                    </Text>
                  </Tap>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={{ gap: spacing(3) }}>
            <Heading title="Browse by game" />
            <View
              style={{
                paddingHorizontal: gutter,
                flexDirection: "row",
                flexWrap: "wrap",
                gap: spacing(2.5),
              }}
            >
              {LAB_GAMES.map((entry) => (
                <GameTile
                  key={entry.slug}
                  game={entry}
                  width={Math.floor((width - gutter * 2 - spacing(2.5)) / 2)}
                  onPress={() => {
                    choose(entry.slug);
                    field.current?.focus();
                  }}
                />
              ))}
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

/** All, then every game: one with no cards yet says so and cannot be chosen. */
function GameChips({
  game,
  onChoose,
}: {
  game: GameSlug | null;
  onChoose: (game: GameSlug | null) => void;
}) {
  const chips: { key: string; label: string; value: GameSlug | null; soon: boolean }[] =
    [
      { key: "all", label: "All", value: null, soon: false },
      ...LAB_GAMES.map((entry) => ({
        key: entry.slug,
        label: entry.name,
        value: entry.slug,
        soon: !entry.catalog,
      })),
    ];
  /* The chosen game's chip is always in sight: picked from a tile (Gundam
     is the last chip) it would otherwise sit off the right edge. */
  const row = useRef<ScrollView>(null);
  const where = useRef(new Map<string, { x: number; width: number }>());
  const { width: screen } = useWindowDimensions();
  const reveal = useCallback(() => {
    const spot = where.current.get(game ?? "all");
    if (!spot) return;
    row.current?.scrollTo({ x: Math.max(0, spot.x + spot.width / 2 - screen / 2), animated: true });
  }, [game, screen]);
  useEffect(reveal, [reveal]);

  return (
    <ScrollView
      ref={row}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: gutter, gap: spacing(2) }}
    >
      {chips.map((chip) => {
        const on = chip.value === game;
        return (
          <View
            key={chip.key}
            onLayout={(event) => {
              const { x, width } = event.nativeEvent.layout;
              where.current.set(chip.key, { x, width });
              if (on) reveal();
            }}
          >
          <Tap
            disabled={chip.soon}
            onPress={() => onChoose(chip.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled: chip.soon }}
            accessibilityLabel={chip.soon ? `${chip.label}, coming soon` : chip.label}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing(1.5),
              height: 36,
              paddingHorizontal: spacing(3.5),
              borderRadius: 999,
              borderWidth: 1,
              borderColor: on ? colors.accent : colors.border,
              backgroundColor: on ? colors.accent : colors.surface,
              opacity: chip.soon ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                color: on ? colors.accentContrast : colors.textPrimary,
                fontSize: 14,
                fontWeight: "700",
              }}
            >
              {chip.label}
            </Text>
            {chip.soon ? (
              <Text
                style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}
              >
                SOON
              </Text>
            ) : null}
          </Tap>
          </View>
        );
      })}
    </ScrollView>
  );
}

/** A game's tile: its logo in the accent, and nothing else to read. */
function GameTile({
  game,
  width,
  onPress,
}: {
  game: LabGame;
  width: number;
  onPress: () => void;
}) {
  const logo = GAME_LOGO[game.slug];
  return (
    <Tap
      disabled={!game.catalog}
      onPress={onPress}
      accessibilityLabel={
        game.catalog ? `Search ${game.name}` : `${game.name}, coming soon`
      }
      style={{
        width,
        height: Math.round(width * 0.62),
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        alignItems: "center",
        justifyContent: "center",
        padding: spacing(4),
        gap: spacing(1),
        opacity: game.catalog ? 1 : 0.6,
      }}
    >
      {logo ? (
        <Image
          source={logo}
          resizeMode="contain"
          style={{ width: "100%", height: "100%" }}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <>
          <Text style={{ color: colors.accent, fontSize: 20, fontWeight: "800" }}>
            {game.name}
          </Text>
          {!game.catalog ? (
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700" }}>
              Coming soon
            </Text>
          ) : null}
        </>
      )}
    </Tap>
  );
}

function Results({
  answer,
  tile,
  query,
  game,
  players,
  stores,
  onOpen,
  onAllGames,
  onRetry,
  onPlayer,
  onStore,
}: {
  answer: Answer<CardHit>;
  tile: number;
  query: string;
  game: GameSlug | null;
  players: FoundPlayer[];
  stores: FoundStore[];
  onOpen: (card: RecentCard) => void;
  onAllGames: () => void;
  onRetry: () => void;
  onPlayer: (playerId: string) => void;
  onStore: (storeId: string) => void;
}) {
  /* Cards already on your Flares wear a small flame (my-flares.ts). */
  useMyFlares();
  return (
    <View style={{ gap: spacing(5) }}>
      <View style={{ gap: spacing(3) }}>
        <Heading title="Cards" />
        {answer.state === "loading" || answer.state === "idle" ? (
          <Grid>
            {Array.from({ length: 6 }, (_, index) => (
              <View key={index} style={{ width: tile, gap: spacing(1.5) }}>
                <View
                  style={{
                    width: tile,
                    height: Math.round(tile * ASPECT),
                    borderRadius: 8,
                    backgroundColor: colors.elevated,
                  }}
                />
                <View
                  style={{
                    width: tile * 0.8,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: colors.elevated,
                  }}
                />
                <View
                  style={{
                    width: tile * 0.5,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.surface,
                  }}
                />
              </View>
            ))}
          </Grid>
        ) : answer.state === "error" ? (
          <Notice
            line="Search couldn't reach cardflare. Check your connection."
            action="Try again"
            onAction={onRetry}
          />
        ) : answer.items.length === 0 ? (
          <Notice
            line={noCardsLine(query, game)}
            action={game ? "Search all games" : undefined}
            onAction={game ? onAllGames : undefined}
          />
        ) : (
          <Grid>
            {answer.items.map((hit) => {
              const lead =
                hit.printings.find((p) => p.id === hit.basePrintingId) ??
                hit.printings[0];
              const card: RecentCard = {
                cardId: hit.id,
                name: hit.name,
                cardNumber: hit.cardNumber,
                label: lead?.label ?? null,
                imageUrl: leadArt(hit),
                game: hit.game ?? null,
              };
              const count = hit.printings.length;
              return (
                <View key={hit.id} style={{ width: tile, gap: spacing(1) }}>
                  <View>
                    <Tap
                      onPress={() => onOpen(card)}
                      accessibilityLabel={`Open ${hit.name}`}
                    >
                      <Art uri={card.imageUrl} width={tile} name={hit.name} />
                    </Tap>
                    {/* Already on your Flares, any art of it: the founder,
                        "it'll have a logo or something when you search for
                        it that you already have it on your list." */}
                    {cardFlared(hit.id) ? (
                      <FlaredMark style={{ position: "absolute", top: 5, right: 5 }} />
                    ) : null}
                    {/* How many printings, on the card itself: the founder,
                        "a small icon with number of printings on the card
                        itself, instead of a whole row". One printing, none. */}
                    {count > 1 ? (
                      <View
                        pointerEvents="none"
                        accessibilityLabel={`${count} printings`}
                        style={{
                          position: "absolute",
                          left: 5,
                          bottom: 5,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 3,
                          paddingHorizontal: 6,
                          height: 20,
                          borderRadius: 999,
                          backgroundColor: "rgba(0,0,0,0.78)",
                        }}
                      >
                        <Ionicons name="layers" size={11} color={colors.textPrimary} />
                        <Text style={{ color: colors.textPrimary, fontSize: 11, fontWeight: "800" }}>
                          {count}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {/* One line each, so every tile is the same height and
                      the rows line up. */}
                  <Text numberOfLines={1} style={tileName()}>
                    {displayCardName(hit.name, hit.cardNumber)}
                  </Text>
                  <Text numberOfLines={1} style={tileMeta()}>
                    {[
                      hit.cardNumber,
                      !game && hit.game ? gameShortName(hit.game) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  <Text numberOfLines={1} style={tileMeta()}>
                    {lead?.label ?? " "}
                  </Text>
                </View>
              );
            })}
          </Grid>
        )}
      </View>

      {players.length > 0 ? (
        <View style={{ gap: spacing(2) }}>
          <Heading title="Players" />
          <View style={listBox()}>
            {players.map((person, index) => (
              <Tap
                key={person.playerId}
                onPress={() => onPlayer(person.playerId)}
                accessibilityLabel={`Open ${person.displayName}`}
                style={[listRow(), index > 0 && listDivider()]}
              >
                <PlayerAvatar
                  displayName={person.displayName}
                  seed={person.playerId}
                  avatarUrl={person.avatarUrl}
                  size={36}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.textPrimary, fontWeight: "700" }}
                  >
                    {person.displayName}
                  </Text>
                  {person.handle ? (
                    <Text numberOfLines={1} style={tileMeta()}>
                      {formatHandle(person.handle)}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Tap>
            ))}
          </View>
        </View>
      ) : null}

      {stores.length > 0 ? (
        <View style={{ gap: spacing(2) }}>
          <Heading title="Stores" />
          <View style={listBox()}>
            {stores.map((store, index) => (
              <Tap
                key={store.storeId}
                onPress={() => onStore(store.storeId)}
                accessibilityLabel={`Open ${store.name}`}
                style={[listRow(), index > 0 && listDivider()]}
              >
                <Ionicons
                  name="storefront-outline"
                  size={20}
                  color={colors.textSecondary}
                />
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, color: colors.textPrimary, fontWeight: "700" }}
                >
                  {store.name}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Tap>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        paddingHorizontal: gutter,
        flexDirection: "row",
        flexWrap: "wrap",
        columnGap: GRID_GAP,
        rowGap: spacing(5),
      }}
    >
      {children}
    </View>
  );
}

function Art({
  uri,
  width,
  name,
}: {
  uri: string | null;
  width: number;
  name: string;
}) {
  return (
    <View
      style={{
        width,
        height: Math.round(width * ASPECT),
        borderRadius: 8,
        overflow: "hidden",
        backgroundColor: colors.elevated,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {uri ? (
        <RemoteImage
          uri={uri}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          accessibilityLabel={name}
        />
      ) : (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: spacing(2),
          }}
        >
          <Text
            numberOfLines={3}
            style={{ color: colors.textMuted, fontSize: 11, textAlign: "center" }}
          >
            {name}
          </Text>
        </View>
      )}
    </View>
  );
}

function Heading({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View
      style={{
        paddingHorizontal: gutter,
        flexDirection: "row",
        alignItems: "baseline",
        justifyContent: "space-between",
      }}
    >
      <Text
        accessibilityRole="header"
        style={{ color: colors.textPrimary, fontSize: 19, fontWeight: "800" }}
      >
        {title}
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

function Notice({
  line,
  action,
  onAction,
}: {
  line: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View
      style={{
        marginHorizontal: gutter,
        padding: spacing(5),
        gap: spacing(3),
        alignItems: "center",
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <Text style={{ color: colors.textSecondary, fontSize: 15, textAlign: "center" }}>
        {line}
      </Text>
      {action && onAction ? (
        <Tap onPress={onAction} accessibilityLabel={action}>
          <Text style={{ color: colors.accent, fontSize: 15, fontWeight: "700" }}>
            {action}
          </Text>
        </Tap>
      ) : null}
    </View>
  );
}

const tileName = () => ({
  color: colors.textPrimary,
  fontSize: 13,
  fontWeight: "700" as const,
  lineHeight: 17,
});
const tileMeta = () => ({ color: colors.textSecondary, fontSize: 11.5 });
const listBox = () => ({
  marginHorizontal: gutter,
  paddingHorizontal: spacing(3),
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.surface,
});
const listRow = () => ({
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: spacing(3),
  paddingVertical: spacing(3),
});
const listDivider = () => ({ borderTopWidth: 1, borderTopColor: colors.border });
