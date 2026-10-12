import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import type { NearbyMatch, WantedSummary } from "./api";
import { HeldRing } from "./held-ring";
import {
  WANTED_HEADING,
  WANTED_PRIVATE_LINE,
  shortMiles,
  wantedCountLine,
} from "./nearby-shared";
import { PlayerAvatar } from "./player-avatar";
import { colors, spacing } from "./theme";
import { Button, Card, CardImage, Tap } from "./ui";

/** "14 people · closest under 2 mi away", for one card's line. */
export function peopleLine(count: number, nearestLabel: string): string {
  return `${count} ${count === 1 ? "person" : "people"} · closest ${nearestLabel
    .charAt(0)
    .toLowerCase()}${nearestLabel.slice(1)}`;
}

/**
 * WANTED NEAR YOU, on the Feed: the three cards of yours the most
 * people near you want, a few faces on each, and the way into the
 * whole list. The same size whether three people are looking or three
 * hundred - the founder: "we need a way to consolidate that screen so
 * that it's not overwhelming." The website draws the same card
 * (src/components/nearby/wanted-summary.tsx).
 */
export function WantedSummaryCard({
  summary,
  onOpen,
}: {
  summary: WantedSummary;
  /** With a card: open the screen on that card's people. */
  onOpen: (cardId?: string) => void;
}) {
  return (
    <Card style={{ borderColor: `${colors.accent}66` }}>
      <View style={{ gap: 2 }}>
        <Text
          style={{
            color: colors.accent,
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 1.6,
            textTransform: "uppercase",
          }}
        >
          {WANTED_HEADING}
        </Text>
        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "600" }}>
          {wantedCountLine(summary.totalPeople)}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{WANTED_PRIVATE_LINE}</Text>
      </View>

      <View style={{ gap: spacing(3) }}>
        {summary.groups.map((group) => (
          <Tap
            key={group.card.cardId}
            accessibilityLabel={`${group.card.cardName}, ${peopleLine(group.count, group.nearestLabel)}`}
            onPress={() => onOpen(group.card.cardId)}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}
          >
            <View>
              <CardImage
                imageUrl={group.card.imageUrl}
                width={44}
                name={group.card.cardName}
                cardNumber={group.card.cardNumber}
                youHave={{ kind: group.card.match, count: 0 }}
              />
              <HeldRing match={group.card.match} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text
                numberOfLines={1}
                style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "600" }}
              >
                {group.card.cardName}
              </Text>
              <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
                {peopleLine(group.count, group.nearestLabel)}
              </Text>
            </View>
            <Faces faces={group.faces} count={group.count} />
          </Tap>
        ))}
      </View>

      <Button
        label={
          summary.totalCards > summary.groups.length
            ? `See all ${summary.totalCards} cards`
            : "See everyone"
        }
        variant="secondary"
        onPress={() => onOpen()}
      />
    </Card>
  );
}

/** A few faces, overlapped, and "+11" for the rest. */
function Faces({ faces, count }: { faces: NearbyMatch["wanter"][]; count: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {faces.map((face, index) => (
        <View
          key={face.playerId}
          style={{
            marginLeft: index === 0 ? 0 : -8,
            borderRadius: 999,
            borderWidth: 2,
            borderColor: colors.surface,
          }}
        >
          <PlayerAvatar
            displayName={face.displayName}
            seed={face.playerId}
            avatarUrl={face.avatarUrl}
            frame={face.frame}
            size={26}
          />
        </View>
      ))}
      {count > faces.length ? (
        <Text
          style={{
            marginLeft: spacing(1.5),
            color: colors.textMuted,
            fontSize: 12,
            fontWeight: "600",
          }}
        >
          {`+${count - faces.length}`}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The message icon at the end of a row. Outlined: tap to write. Filled:
 * a conversation exists, and the tap opens it.
 */
export function MessageIcon({
  messaged,
  label,
  onPress,
}: {
  messaged: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Tap
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: messaged ? `${colors.accent}66` : colors.borderStrong,
        backgroundColor: messaged ? colors.accentTint : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons
        name={messaged ? "chatbubble" : "chatbubble-outline"}
        size={19}
        color={colors.accent}
      />
    </Tap>
  );
}

/** A person row's face, in points. Lists that hold these leave room for
    the ring around it (avatarOverhang). */
export const PERSON_AVATAR = 32;

/**
 * One person on "Wanted near you": face, name, how far, and the message
 * icon to the right. No "I have this" - the founder: "of course you
 * have it... that's the whole reason it's on your screen."
 */
export function PersonRow({
  person,
  onOpenThread,
  onCompose,
}: {
  person: NearbyMatch;
  onOpenThread: (threadId: string) => void;
  /** No conversation yet: open a new one, the first line written. */
  onCompose: () => void;
}) {
  const first = person.wanter.displayName.split(" ")[0];

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}>
      <PlayerAvatar
        displayName={person.wanter.displayName}
        seed={person.wanter.playerId}
        avatarUrl={person.wanter.avatarUrl}
        frame={person.wanter.frame}
        ring={person.wanter.ring}
        aura={person.wanter.aura}
        ringArt={person.wanter.ringArt}
        auraArt={person.wanter.auraArt}
        size={PERSON_AVATAR}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "600" }}
        >
          {person.wanter.displayName}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="location-outline" size={12} color={colors.textMuted} />
          {/* Short, and no "Messaged": the filled icon already says it. */}
          <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
            {shortMiles(person.miles)}
          </Text>
        </View>
      </View>
      <MessageIcon
        messaged={Boolean(person.threadId)}
        label={
          person.threadId
            ? `Open your conversation with ${first}`
            : `Message ${first} about ${person.card.cardName}`
        }
        onPress={() => (person.threadId ? onOpenThread(person.threadId) : onCompose())}
      />
    </View>
  );
}
