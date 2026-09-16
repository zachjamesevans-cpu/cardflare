import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { setFlareFound, type FeedCard } from "./api";
import type { FlareSheetPost } from "./flare-cards-sheet";
import { copiesOf, remainingOf } from "./flare-deck-pager";
import { needLabel, printingLabel } from "./flare-copy";
import { HuntProgress, UndoLine } from "./hunts-panel";
import { RemoteImage } from "./remote-image";
import { Stepper } from "./stepper";
import { colors, radius, spacing } from "./theme";
import { useCopiesFound } from "./use-copies-found";
import { Button, ErrorLine, Muted, Tap, Title } from "./ui";

/**
 * "Update progress" on your own Flare: copies found, per card.
 *
 * The same "+1 found", stepper and Undo the hunts panel offers, reached
 * from the post instead of the profile, because the post is where the
 * owner is when a friend says "got it". It writes by Flare, which is
 * what a post knows; the server finds the request behind it.
 *
 * Every write asks the Feed to reload, so the post behind the sheet
 * reads the new count when the sheet closes rather than on the next
 * pull. A finished card stays in the list, dimmed and ticked, because
 * a list that hid its finished rows would only ever show unfinished
 * work.
 */
export function FlareProgressSheet({
  open,
  onClose,
  onChanged,
}: {
  open: FlareSheetPost | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const copies = useCopiesFound({ reset: open, onChanged });

  if (!open) return null;

  const foundFor = (card: FeedCard): number =>
    copies.foundFor(card.flareId ?? card.cardId, copiesOf(card) - remainingOf(card));

  const write = (card: FeedCard, value: number) =>
    copies.write(
      {
        key: card.flareId ?? card.cardId,
        label: card.cardName,
        needed: copiesOf(card),
        current: copiesOf(card) - remainingOf(card),
        save: (next) =>
          card.flareId
            ? setFlareFound(card.flareId, next)
            : Promise.reject(new Error("not-saved")),
      },
      value,
    );

  const needed = open.cards.reduce((sum, card) => sum + copiesOf(card), 0);
  const found = open.cards.reduce((sum, card) => sum + foundFor(card), 0);
  const done = needed > 0 && found >= needed;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.75)",
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={() => undefined}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.panel,
            borderTopRightRadius: radius.panel,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing(4),
            paddingBottom: spacing(4) + insets.bottom,
            gap: spacing(3),
            maxHeight: "88%",
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
            <Title>{done ? "All found" : "Update progress"}</Title>
            <Tap onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Tap>
          </View>

          <HuntProgress found={found} needed={needed} />
          {copies.undoLabel ? (
            <UndoLine label={copies.undoLabel} onUndo={copies.undoLast} />
          ) : null}

          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ gap: spacing(2) }}
          >
            {open.cards.map((card) => {
              const total = copiesOf(card);
              const have = foundFor(card);
              const left = Math.max(0, total - have);
              const finished = left === 0;
              return (
                <View
                  key={card.cardId}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing(2.5),
                    borderRadius: radius.control,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.elevated,
                    padding: spacing(2),
                    opacity: finished ? 0.7 : 1,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 56,
                      borderRadius: 4,
                      overflow: "hidden",
                      backgroundColor: colors.surface,
                    }}
                  >
                    <RemoteImage
                      uri={card.imageUrl}
                      style={{ width: "100%", height: "100%" }}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: spacing(1),
                      }}
                    >
                      {finished ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={14}
                          color={colors.accent}
                        />
                      ) : null}
                      <Text
                        numberOfLines={1}
                        style={{
                          color: colors.textPrimary,
                          fontWeight: "700",
                          fontSize: 14,
                          flexShrink: 1,
                        }}
                      >
                        {card.cardName}
                      </Text>
                    </View>
                    <Text
                      numberOfLines={1}
                      style={{ color: colors.textMuted, fontSize: 12 }}
                    >
                      {printingLabel(card.printingLabel)}
                    </Text>
                    <Text
                      style={{
                        color: finished ? colors.textMuted : colors.accent,
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      {`${have} of ${total} found${finished ? "" : ` · ${needLabel(left)}`}`}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: spacing(1.5) }}>
                    {!finished ? (
                      <Tap
                        onPress={() => write(card, have + 1)}
                        accessibilityLabel={`One more ${card.cardName} found`}
                        style={{
                          borderRadius: 999,
                          backgroundColor: colors.accent,
                          paddingHorizontal: spacing(2.5),
                          paddingVertical: 4,
                        }}
                      >
                        <Text
                          style={{
                            color: colors.accentContrast,
                            fontSize: 12,
                            fontWeight: "700",
                          }}
                        >
                          +1 found
                        </Text>
                      </Tap>
                    ) : null}
                    <Stepper
                      value={have}
                      min={0}
                      max={total}
                      onChange={(value) => write(card, value)}
                      label={`copies of ${card.cardName} found`}
                      disabled={!card.flareId}
                    />
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <ErrorLine message={copies.error} />
          {done ? (
            <Muted>Every copy is in hand. Nobody can offer on this now.</Muted>
          ) : null}
          <Button label="Done" variant="secondary" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
