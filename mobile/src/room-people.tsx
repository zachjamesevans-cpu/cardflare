import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SheetBackdrop } from "./action-menu";
import type { RoomState } from "./api";
import { OpenToTradesTag } from "./open-to-trades-tag";
import { PlayerAvatar } from "./player-avatar";
import { colors, radius, spacing } from "./theme";
import { Muted, Tap, Title } from "./ui";

/**
 * Who is in the room, behind the door card's meta line.
 *
 * This was the "In this room" card at the foot of the page, folded
 * shut with the names inside. The founder, on the room: "There's just
 * so many blocks... It's all just disconnected and want it to flow
 * better." So the counts moved onto the door card, where a glance
 * wants them, and the names wait here behind one tap: the same rows
 * the fold drew, present first, dimmed when away, the Open to trades
 * tag beside a name, and a tap on an account opening the profile
 * popup. The website's "Who's here" sheet draws the same list.
 */

export type RoomPerson = NonNullable<RoomState["participants"]>[number];

export function RoomPeopleModal({
  open,
  participants,
  onClose,
  onPeek,
}: {
  open: boolean;
  participants: RoomPerson[];
  onClose: () => void;
  /** An account's row was tapped; the room opens the profile popup. */
  onPeek: (playerId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const hereNow = participants.filter((p) => p.present).length;
  const sorted = [...participants].sort(
    (a, b) => Number(b.present) - Number(a.present),
  );

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <SheetBackdrop />
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          justifyContent: "flex-end",
          padding: spacing(3),
          paddingBottom: Math.max(spacing(3), insets.bottom),
        }}
      >
        {/* Taps on the panel stay in the panel. */}
        <Pressable
          onPress={() => {}}
          style={{
            maxHeight: "70%",
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            padding: spacing(4),
            gap: spacing(3),
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing(2),
            }}
          >
            <View style={{ gap: 2, flexShrink: 1 }}>
              <Title>Who&rsquo;s here</Title>
              <Muted>{`${hereNow} here now · ${participants.length} tonight`}</Muted>
            </View>
            <Tap onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Tap>
          </View>

          <ScrollView contentContainerStyle={{ gap: spacing(1.5) }}>
            {sorted.map((p) => {
              const row = (
                <>
                  {/* The picture and the border they bought, so a
                      thing earned is worn where the people are. */}
                  <PlayerAvatar
                    displayName={p.displayName ?? "A player"}
                    seed={p.playerSessionId}
                    avatarUrl={p.avatarUrl ?? null}
                    frame={p.frame ?? null}
                    ring={p.ring ?? null}
                    aura={p.aura ?? null}
                    ringArt={p.ringArt ?? null}
                    auraArt={p.auraArt ?? null}
                    dimmed={!p.present}
                  />
                  <Text
                    style={{
                      color: p.present ? colors.textPrimary : colors.textSecondary,
                      flexShrink: 1,
                    }}
                    numberOfLines={1}
                  >
                    {p.displayName ?? "A player"}
                  </Text>
                  {p.openToTrades && <OpenToTradesTag />}
                  {!p.present && (
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>away</Text>
                  )}
                </>
              );

              /*
               * An account opens the profile popup, the website's
               * behaviour. A guest is not a dead button, they are
               * somebody who does not need an account to trade, so
               * their row stays plain.
               */
              return p.playerId ? (
                <Tap
                  key={p.playerSessionId}
                  onPress={() => onPeek(p.playerId!)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing(2),
                  }}
                >
                  {row}
                </Tap>
              ) : (
                <View
                  key={p.playerSessionId}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing(2),
                  }}
                >
                  {row}
                </View>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
