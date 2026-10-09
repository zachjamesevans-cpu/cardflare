import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import type { StackParams } from "../App";
import {
  openDirectThread,
  serverMessage,
  storedAccessToken,
  type MatchCard,
  type MutualMatch,
} from "./api";
import {
  MUTUAL_LINE,
  MUTUAL_MATCH,
  OTHER_PRINTING_SHORT,
  THEY_WANT,
  YOU_WANT,
} from "./night-copy";
import { HeldRing } from "./held-ring";
import { PlayerAvatar } from "./player-avatar";
import { colors, radius, spacing } from "./theme";
import { Button, CardImage, ErrorLine, Tap, type ZoomCard } from "./ui";

/**
 * The Mutual match block: the website's mutual-match.tsx.
 *
 * The founder (2026-10-03): "A special high-priority state 'MUTUAL
 * MATCH': Player A wants something Player B owns AND Player B wants
 * something Player A owns. Visually stands out significantly more than
 * normal matches ... Mutual Match should feel like one of Cardflare's
 * signature mechanics. Do NOT treat this like a normal notification."
 * So it is the one thing on the page with an accent border: the flame,
 * the name, the two rows of thumbnails, the line, and the button that
 * opens a conversation. Never a plain row.
 */
export function MutualMatchBlock({
  match,
  onPlayer,
}: {
  match: MutualMatch;
  /** The name opens the event-facing profile. */
  onPlayer?: (playerId: string) => void;
}) {
  const { player } = match;

  return (
    <View
      style={{
        borderRadius: radius.card,
        borderWidth: 1.5,
        borderColor: colors.accent,
        backgroundColor: colors.surface,
        padding: spacing(3.5),
        gap: spacing(2.5),
        shadowColor: colors.accent,
        shadowOpacity: 0.25,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 0 },
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}>
        <Ionicons name="flame" size={14} color={colors.accent} />
        <Text
          style={{
            color: colors.accent,
            fontSize: 11,
            fontWeight: "800",
            letterSpacing: 1.6,
            textTransform: "uppercase",
          }}
        >
          {MUTUAL_MATCH}
        </Text>
      </View>

      <Tap
        onPress={onPlayer ? () => onPlayer(player.playerId) : undefined}
        disabled={!onPlayer}
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
        <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: "800" }}>
          {player.displayName}
        </Text>
      </Tap>

      <ThumbRow label={YOU_WANT} cards={match.youWant} />
      <ThumbRow label={THEY_WANT} cards={match.theyWant} held />

      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{MUTUAL_LINE}</Text>

      <MessageButton
        playerId={player.playerId}
        label={`Message ${player.displayName}`}
      />
    </View>
  );
}

/**
 * "You want:" and a rail of thumbnails, each opening the viewer. A
 * card matched on another printing says so in one muted line under
 * the tile: "They have another printing" on their side, "You have
 * another printing" on yours. The caption keeps the printing the
 * wanter named. The website's MatchThumbs.
 *
 * The They want row is cards YOU hold, every one, so it wears the
 * green ring; on the other row a card's `match` says how well THEY
 * hold it, which is not the ring's fact, so no ring there.
 */
export function ThumbRow({
  label,
  cards,
  width = 44,
  held = false,
}: {
  label: string;
  cards: MatchCard[];
  width?: number;
  /** True on the They want row: the viewer holds every card in it. */
  held?: boolean;
}) {
  const shelf: ZoomCard[] = cards.map((card) => ({
    imageUrl: card.imageUrl,
    name: card.name,
    cardNumber: card.number,
    caption: card.printingLabel,
    youHave: held ? { kind: card.match, count: 0 } : null,
  }));

  return (
    <View style={{ gap: spacing(1) }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>
        {`${label}:`}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing(1.5), padding: 2 }}
      >
        {cards.map((card, position) => (
          <View key={card.cardId} style={{ width, gap: spacing(0.5) }}>
            <View>
              <CardImage
                imageUrl={card.imageUrl}
                width={width}
                name={card.name}
                cardNumber={card.number}
                caption={card.printingLabel}
                siblings={shelf}
                position={position}
              />
              <HeldRing match={held ? card.match : null} />
            </View>
            {card.match === "other-printing" ? (
              <Text maxFontSizeMultiplier={1.3} style={{ color: colors.textMuted, fontSize: 11, lineHeight: 12 }}>
                {OTHER_PRINTING_SHORT}
              </Text>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * Message, from a match: opens (or finds) the one direct conversation
 * with that player and lands in it, the way the profile's Message
 * button does. A guest is sent to sign in, because a conversation is
 * between accounts. A refusal comes back in the server's words.
 */
export function MessageButton({
  playerId,
  label = "Message",
  variant = "primary",
}: {
  playerId: string;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const message = async () => {
    if (busy) return;
    if (!(await storedAccessToken())) {
      navigation.navigate("SignIn");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await openDirectThread(playerId);
      if (!alive.current) return;
      if (result.ok && result.threadId) {
        navigation.navigate("LocalThread", { threadId: result.threadId });
        return;
      }
      setError(result.message ?? "Could not start the conversation.");
    } catch (caught) {
      if (!alive.current) return;
      setError(serverMessage(caught) ?? "Could not start the conversation.");
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <View style={{ gap: spacing(1) }}>
      <Button
        label={label}
        variant={variant}
        busy={busy}
        onPress={() => void message()}
      />
      <ErrorLine message={error} />
    </View>
  );
}
