import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { StackParams } from "../../App";
import { AccountPitch } from "../account-pitch";
import {
  ApiError,
  getNightMatches,
  getRoom,
  roomPhaseOf,
  storedAccessToken,
  type MatchCard,
  type MatchPlayer,
  type NightMatches,
  type RoomPhase,
} from "../api";
import { MessageButton, MutualMatchBlock } from "../mutual-match";
import {
  FROM_YOUR_FLARE,
  IN_YOUR_BINDER,
  NO_MATCHES,
  OTHER_PRINTING_THEY,
  OTHER_PRINTING_YOU,
  THEY_HAVE_WHAT_YOU_WANT,
  THEY_WANT_WHAT_YOU_HAVE,
  matchesForYouLine,
} from "../night-copy";
import { NightSection } from "../night-section";
import { PlayerAvatar } from "../player-avatar";
import { colors, gutter, radius, spacing } from "../theme";
import { Body, Card, CardImage, Loading, Tap, Title, type ZoomCard } from "../ui";

/**
 * The night behind a code: its id, its name and where it is in its
 * life, for the screens that are reached by code and ask the server
 * by id. Null until the room answers; `missing` when the code points
 * at nothing.
 */
export function useNightByCode(code: string): {
  night: { eventId: string; name: string; phase: RoomPhase | null } | null;
  missing: boolean;
  failed: boolean;
} {
  const [night, setNight] = useState<{
    eventId: string;
    name: string;
    phase: RoomPhase | null;
  } | null>(null);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const state = await getRoom(code);
        if (!live) return;
        const eventId = state.room?.eventId ?? state.eventId ?? null;
        if (!state.room || !eventId) {
          setMissing(true);
          return;
        }
        setNight({ eventId, name: state.room.name, phase: roomPhaseOf(state) });
      } catch (caught) {
        if (!live) return;
        if (caught instanceof ApiError && caught.status === 404) setMissing(true);
        else setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [code]);

  return { night, missing, failed };
}

/**
 * See all matches: the website's /e/[code]/matches.
 *
 * Mutual match blocks first, then "They have what you want" (one card
 * per player, each card they hold, and whether your side of it is a
 * Flare at this night), then "They want what you have" (what they are
 * looking for, and that it is in your Trade binder). A Message button
 * on every player. A guest sees the sign-in pitch: matching is between
 * accounts and their binders.
 */
export function NightMatchesScreen({ code }: { code: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const insets = useSafeAreaInsets();
  const { night, missing, failed } = useNightByCode(code);
  const [matches, setMatches] = useState<NightMatches | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (eventId: string, alive: () => boolean) => {
    const token = await storedAccessToken();
    if (!alive()) return;
    setSignedIn(Boolean(token));
    if (!token) return;
    try {
      const fresh = await getNightMatches(eventId);
      if (alive()) setMatches(fresh);
    } catch {
      if (alive()) setError("Could not load your matches. Pull back and try again.");
    }
  }, []);

  useEffect(() => {
    if (!night) return;
    let live = true;
    void load(night.eventId, () => live);
    return () => {
      live = false;
    };
  }, [night, load]);

  const onPlayer = (playerId: string) =>
    navigation.navigate("NightPlayer", { code, playerId });

  if (missing || failed) {
    return (
      <View style={{ paddingHorizontal: gutter, paddingVertical: spacing(4) }}>
        <Card>
          <Title>
            {missing ? "No night on that code" : "Could not reach the night"}
          </Title>
          <Body>
            {missing
              ? "That code does not point at a night."
              : "Check your connection and try again."}
          </Body>
        </Card>
      </View>
    );
  }

  if (!night || signedIn === null) return <Loading />;

  if (!signedIn) {
    return (
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
        }}
      >
        <AccountPitch variant="join" />
      </ScrollView>
    );
  }

  if (error) {
    return (
      <View style={{ paddingHorizontal: gutter, paddingVertical: spacing(4) }}>
        <Card>
          <Title>Could not load your matches</Title>
          <Body>{error}</Body>
        </Card>
      </View>
    );
  }

  if (!matches) return <Loading label={night.name} />;

  const nothing =
    matches.mutual.length === 0 &&
    matches.theyHave.length === 0 &&
    matches.theyWant.length === 0;

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: gutter,
        paddingVertical: spacing(4),
        paddingBottom: spacing(6) + insets.bottom,
        gap: spacing(2),
      }}
    >
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{night.name}</Text>
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: 22,
          fontWeight: "800",
          marginBottom: spacing(2),
        }}
      >
        {matchesForYouLine(matches.summary.total)}
      </Text>

      {nothing ? <Body>{NO_MATCHES}</Body> : null}

      {matches.mutual.map((match) => (
        <MutualMatchBlock
          key={match.player.playerId}
          match={match}
          onPlayer={onPlayer}
        />
      ))}

      {matches.theyHave.length > 0 ? (
        <View style={{ paddingTop: spacing(3) }}>
          <NightSection label={THEY_HAVE_WHAT_YOU_WANT}>
            {matches.theyHave.map((entry) => (
              <MatchPlayerCard
                key={entry.player.playerId}
                player={entry.player}
                onPlayer={onPlayer}
                cards={entry.cards.map(({ card, fromYourFlare }) => ({
                  card,
                  lead: "Has",
                  printing:
                    card.match === "other-printing" ? OTHER_PRINTING_THEY : null,
                  note: fromYourFlare ? FROM_YOUR_FLARE : null,
                }))}
              />
            ))}
          </NightSection>
        </View>
      ) : null}

      {matches.theyWant.length > 0 ? (
        <NightSection label={THEY_WANT_WHAT_YOU_HAVE} last>
          {matches.theyWant.map((entry) => (
            <MatchPlayerCard
              key={entry.player.playerId}
              player={entry.player}
              onPlayer={onPlayer}
              cards={entry.cards.map((card) => ({
                card,
                lead: "Looking for",
                printing: card.match === "other-printing" ? OTHER_PRINTING_YOU : null,
                note: IN_YOUR_BINDER,
              }))}
            />
          ))}
        </NightSection>
      ) : null}
    </ScrollView>
  );
}

/**
 * One player in a match list: the face and the name (a tap opens their
 * event-facing profile), one line per card with its thumbnail, the
 * muted "another printing" line when the match is not on the printing
 * the wanter named, and Message. The match card is one of the two
 * boxes the page allows.
 */
function MatchPlayerCard({
  player,
  cards,
  onPlayer,
}: {
  player: MatchPlayer;
  cards: {
    card: MatchCard;
    lead: string;
    /** OTHER_PRINTING_THEY or OTHER_PRINTING_YOU, or null on an exact match. */
    printing: string | null;
    note: string | null;
  }[];
  onPlayer: (playerId: string) => void;
}) {
  const shelf: ZoomCard[] = cards.map(({ card }) => ({
    imageUrl: card.imageUrl,
    name: card.name,
    cardNumber: card.number,
    caption: card.printingLabel,
  }));

  return (
    <View
      style={{
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: spacing(3),
        gap: spacing(2.5),
      }}
    >
      <Tap
        onPress={() => onPlayer(player.playerId)}
        accessibilityLabel={player.displayName}
        style={{ flexDirection: "row", alignItems: "center", gap: spacing(2.5) }}
      >
        <PlayerAvatar
          displayName={player.displayName}
          seed={player.playerId}
          avatarUrl={player.avatarUrl}
          frame={player.frame}
          ring={player.ring}
          aura={player.aura}
          size={36}
        />
        <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "800" }}>
          {player.displayName}
        </Text>
      </Tap>

      <View style={{ gap: spacing(2) }}>
        {cards.map(({ card, lead, printing, note }, position) => (
          <View
            key={card.cardId}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing(2.5) }}
          >
            <CardImage
              imageUrl={card.imageUrl}
              width={36}
              name={card.name}
              cardNumber={card.number}
              caption={card.printingLabel}
              siblings={shelf}
              position={position}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 14 }}>
                <Text style={{ color: colors.textMuted }}>{`${lead}: `}</Text>
                <Text style={{ fontWeight: "700" }}>{card.name}</Text>
                <Text style={{ color: colors.textMuted }}>{`  ${card.number}`}</Text>
              </Text>
              {printing ? (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {printing}
                </Text>
              ) : null}
              {note ? (
                <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "600" }}>
                  {note}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>

      <MessageButton playerId={player.playerId} variant="secondary" />
    </View>
  );
}
