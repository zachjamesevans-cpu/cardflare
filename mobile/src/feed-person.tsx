import { View, Text } from "react-native";

import { PlayerAvatar } from "./player-avatar";
import { colors, spacing } from "./theme";
import { Muted, Tap, Title } from "./ui";

/**
 * A person on the Feed: their face, their name, and where it leads.
 *
 * The app's half of `src/components/feed/feed-person.tsx`, answering the
 * founder's two asks with one field. "Make sure that we are able in the
 * feed to click on profiles" — a row with an account behind it opens
 * that profile. "If someone joins a room as a guest, it should have
 * 'guest' written after their profile guest name" — a row without one
 * says Guest and stays flat, because a tap that goes nowhere is worse
 * than no tap.
 *
 * `playerId` UNDEFINED IS NOT `null`. Undefined means an older server
 * that never sent the field, and labelling a real account a guest is a
 * worse lie than showing no label at all; only an explicit null is a
 * guest. The app and the server ship on different clocks.
 */
export function FeedPerson({
  playerId,
  displayName,
  avatarUrl,
  frame,
  ring,
  aura,
  detail,
  size = 40,
  onOpen,
}: {
  playerId: string | null | undefined;
  displayName: string | null;
  avatarUrl: string | null;
  frame: string | null;
  ring: string | null;
  aura?: string | null;
  detail: string;
  size?: number;
  onOpen: (playerId: string) => void;
}) {
  const name = displayName ?? "A player";
  const guest = playerId === null;

  const face = (
    <>
      <PlayerAvatar
        displayName={name}
        seed={playerId ?? name}
        avatarUrl={avatarUrl}
        frame={frame}
        ring={ring}
        aura={aura ?? null}
        size={size}
      />
      <View style={{ flexShrink: 1 }}>
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}
        >
          <Title>{name}</Title>
          {guest ? <GuestChip /> : null}
        </View>
        <Muted>{detail}</Muted>
      </View>
    </>
  );

  const row = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing(2),
  };

  if (!playerId) return <View style={row}>{face}</View>;

  return (
    <Tap
      accessibilityLabel={`Open ${name}'s profile`}
      onPress={() => onOpen(playerId)}
      style={row}
    >
      {face}
    </Tap>
  );
}

/**
 * The "Guest" mark.
 *
 * A guest is a real person who walked into a shop, not a lesser kind of
 * user — drawn in the metadata colour as a fact rather than a warning.
 * It exists to explain why the name does not open anything.
 */
export function GuestChip() {
  return (
    <Text
      style={{
        color: colors.textMuted,
        fontSize: 9,
        fontWeight: "700",
        letterSpacing: 0.8,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 999,
        paddingHorizontal: 5,
        paddingVertical: 1,
        overflow: "hidden",
      }}
    >
      GUEST
    </Text>
  );
}
