import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { GAME_TLDRS, NIGHT_BASICS } from "./tournament-tldr";
import { Tap } from "./ui";
import { colors, radius, spacing } from "./theme";

/**
 * A first tournament, explained - the app's copy of /tournaments.
 *
 * A modal rather than a screen, because the person reading it is
 * standing in a shop deciding whether to sit down, one tap from the
 * room they are already in. Same content as the website's page, from
 * the mirrored data in tournament-tldr.ts.
 */
export function TournamentHelpModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }}>
        <Pressable style={{ height: spacing(12) }} onPress={onClose} />
        <View
          style={{
            flex: 1,
            backgroundColor: colors.canvas,
            borderTopLeftRadius: radius.card,
            borderTopRightRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
            <View style={{ gap: spacing(1) }}>
              <Text
                style={{ color: colors.textPrimary, fontSize: 22, fontWeight: "800" }}
              >
                New to tournaments?
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                Here is the whole thing, honestly. It is a room of people who like the
                same game you do, playing it on a clock.
              </Text>
            </View>

            <View style={{ gap: spacing(2) }}>
              <Text
                style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700" }}
              >
                How a night works, in any game
              </Text>
              {NIGHT_BASICS.map((line, index) => (
                <View key={index} style={{ flexDirection: "row", gap: spacing(2) }}>
                  <Text
                    style={{ color: colors.accent, fontWeight: "700", fontSize: 13 }}
                  >
                    {index + 1}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>
                    {line}
                  </Text>
                </View>
              ))}
            </View>

            {GAME_TLDRS.map((game) => (
              <View
                key={game.id}
                style={{
                  gap: spacing(1.5),
                  borderRadius: radius.control,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  padding: spacing(3),
                }}
              >
                <Text
                  style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700" }}
                >
                  {game.name}
                </Text>
                {game.lines.map((line, index) => (
                  <Text
                    key={index}
                    style={{ color: colors.textSecondary, fontSize: 13 }}
                  >
                    {`•  ${line}`}
                  </Text>
                ))}
              </View>
            ))}

            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              Formats and timings vary by shop and by event, so these are the common
              case, not a promise. The screen at the event always shows the real clock
              and the real end-of-round procedure.
            </Text>

            <Tap
              onPress={onClose}
              style={{
                alignItems: "center",
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: colors.border,
                paddingVertical: spacing(3),
              }}
            >
              <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>
                Close
              </Text>
            </Tap>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
