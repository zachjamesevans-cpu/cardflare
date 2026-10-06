import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SheetBackdrop } from "./action-menu";
import type { RoomState } from "./api";
import { OpenToTradesTag } from "./open-to-trades-tag";
import { PlayerAvatar } from "./player-avatar";
import { colors, radius, spacing } from "./theme";
import { Muted, SheetClose, Tap, Title } from "./ui";

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

/**
 * One row per person, however many seats they hold.
 *
 * The audit: the door said "1 here now" while two faces showed, and a
 * player appeared twice. An account that joined from the website and
 * again from the phone has two sessions on the roster, and a roster is
 * a list of people, not of sessions. Keyed on the account when there is
 * one, the session otherwise (a guest is one seat by definition). When
 * the seats disagree about presence the present one wins, so somebody
 * in the room is never drawn as away because an old tab went quiet.
 * The website's `room-door.tsx` dedupes the same way.
 */
export function dedupeParticipants(participants: RoomPerson[]): RoomPerson[] {
  const byPerson = new Map<string, RoomPerson>();
  for (const person of participants) {
    const key = person.playerId
      ? `player:${person.playerId}`
      : `session:${person.playerSessionId}`;
    const seen = byPerson.get(key);
    if (!seen) {
      byPerson.set(key, person);
    } else if (!seen.present && person.present) {
      byPerson.set(key, {
        ...person,
        openToTrades: seen.openToTrades || person.openToTrades,
      });
    } else if (person.openToTrades && !seen.openToTrades) {
      byPerson.set(key, { ...seen, openToTrades: true });
    }
  }
  return [...byPerson.values()];
}

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
  /* People, not seats: the count and the rows agree with the door. */
  const people = dedupeParticipants(participants);
  const hereNow = people.filter((p) => p.present).length;
  const sorted = [...people].sort((a, b) => Number(b.present) - Number(a.present));

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
              <Muted>{`${hereNow} here now · ${people.length} coming`}</Muted>
            </View>
            <SheetClose onPress={onClose} />
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
