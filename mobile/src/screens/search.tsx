import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useRef, useState, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import {
  searchCards,
  searchPlayersByName,
  searchStores,
  type CardHit,
  type FoundPlayer,
  type FoundStore,
} from "../api";
import { gameShortName } from "../games";
import { formatHandle } from "../handle";
import { PlayerAvatar } from "../player-avatar";
import { RemoteImage } from "../remote-image";
import { Input, Muted, Tap } from "../ui";
import { colors, gutter, radius, spacing } from "../theme";
import { VerifiedMark } from "../verified-mark";

/**
 * One search for everything, from the Feed's own header.
 *
 * This began as "Find a player": the founder, "the social features
 * should be a litle more front and center... let's make a search icon
 * in the top right of the main feed." Now the same door finds a card,
 * a player or a store, in that order, each under its own heading and
 * only when it has rows. A card opens its page, a player their
 * profile, a store its page. The website's `EverythingSearch`
 * (src/components/feed/everything-search.tsx) is the same thing with
 * the same words; tests/unit/search-parity.test.ts holds them together.
 *
 * Three searches go out at once and the slowest one does not hold the
 * others back: a section lands as its answer does. Debounced, and
 * guarded against answers landing out of order, because shop wifi is
 * slow enough that the third keystroke can beat the first.
 */

/** How long typing must pause before the search goes, in milliseconds. */
export const SEARCH_DEBOUNCE_MS = 250;

/** Fewer characters than this and nothing is asked. */
export const SEARCH_MIN_CHARS = 2;

interface Results {
  cards: CardHit[];
  players: FoundPlayer[];
  stores: FoundStore[];
  /** Searches still out. "Nothing for that yet." waits for zero. */
  pending: number;
}

const NOTHING_YET: Results = { cards: [], players: [], stores: [], pending: 3 };

/** The art a card search row leads with: the base printing's, else the first's. */
export function leadArt(card: CardHit): string | null {
  const base = card.printings.find((printing) => printing.id === card.basePrintingId);
  return base?.imageUrl ?? card.printings[0]?.imageUrl ?? null;
}

export function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [query, setQuery] = useState("");
  /* Null until a search has run: before typing, nothing is said. */
  const [found, setFound] = useState<Results | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  const searchFor = (text: string) => {
    if (timer.current) clearTimeout(timer.current);

    const trimmed = text.trim();
    if (trimmed.length < SEARCH_MIN_CHARS) {
      setFound(null);
      return;
    }

    const request = ++latest.current;
    timer.current = setTimeout(() => {
      /* Each section lands as its answer does; a failed one is an
         empty one. The "nothing" line waits until all three are in,
         so a fast empty answer never says nothing while a slow full
         one is still coming. */
      const settle = <K extends "cards" | "players" | "stores">(
        key: K,
        rows: Promise<Results[K]>,
      ) => {
        rows
          .catch(() => [] as Results[K])
          .then((value) => {
            if (latest.current !== request) return;
            setFound((current) => ({
              ...(current ?? NOTHING_YET),
              [key]: value,
              pending: (current ?? NOTHING_YET).pending - 1,
            }));
          });
      };
      setFound(null);
      settle(
        "cards",
        searchCards(trimmed).then((result) => result.cards),
      );
      settle(
        "players",
        searchPlayersByName(trimmed).then((result) => result.players),
      );
      settle(
        "stores",
        searchStores(trimmed).then((result) => result.stores),
      );
    }, SEARCH_DEBOUNCE_MS);
  };

  const nothing =
    found !== null &&
    found.pending === 0 &&
    found.cards.length === 0 &&
    found.players.length === 0 &&
    found.stores.length === 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{
        paddingHorizontal: gutter,
        paddingVertical: spacing(4),
        gap: spacing(3),
      }}
      keyboardShouldPersistTaps="handled"
    >
      {/* No heading: the navigation bar above already says "Search",
          and saying it twice is how a screen looks unfinished. */}
      <Input
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          searchFor(text);
        }}
        placeholder="Search cards, players and stores"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
      />

      {nothing ? <Muted>Nothing for that yet.</Muted> : null}

      {found && found.cards.length > 0 ? (
        <Section heading="Cards">
          {found.cards.map((card, index) => (
            <Row
              key={card.id}
              first={index === 0}
              label={`Open ${card.name}`}
              onPress={() => navigation.navigate("Card", { cardId: card.id })}
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
                  {card.name}
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
      ) : null}

      {found && found.players.length > 0 ? (
        <Section heading="Players">
          {found.players.map((person, index) => (
            <Row
              key={person.playerId}
              first={index === 0}
              label={`Open ${person.displayName}'s profile`}
              onPress={() =>
                navigation.navigate("PlayerProfile", { playerId: person.playerId })
              }
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
      ) : null}

      {found && found.stores.length > 0 ? (
        <Section heading="Stores">
          {found.stores.map((store, index) => (
            <Row
              key={store.storeId}
              first={index === 0}
              label={`Open ${store.name}`}
              onPress={() =>
                navigation.navigate("StoreProfile", { storeId: store.storeId })
              }
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
      ) : null}
    </ScrollView>
  );
}

/** One of the three result groups: its heading, then its rows. */
function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing(1) }}>
      <Text
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
      <View
        style={{
          borderRadius: radius.control,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: spacing(3),
        }}
      >
        {children}
      </View>
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
