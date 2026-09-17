import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { describeError, offerItemsOnPost, type FeedCard } from "./api";
import { copiesOf, remainingOf } from "./flare-deck-pager";
import {
  availableLabel,
  cardsLabel,
  copiesLabel,
  GONE_LABEL,
  needLabel,
  printingLabel,
  selectionLabel,
} from "./flare-copy";
import { RemoteImage } from "./remote-image";
import { Stepper } from "./stepper";
import { colors, radius, spacing } from "./theme";
import { AsyncButton, Button, ErrorLine, Input, Muted, Tap, Title } from "./ui";

/**
 * The post a sheet is about: enough to list its cards and to offer on
 * them. Built from a Feed item or from the post's own screen, which
 * carry the same cards under different names.
 */
export interface FlareSheetPost {
  postId: string;
  posterName: string;
  direction: "want" | "showcase";
  yours: boolean;
  completed: boolean;
  cards: FeedCard[];
}

/**
 * Every card on a Flare, in a sheet from the bottom.
 *
 * "View all 3" opens it to read; "Offer cards" opens it to pick. The
 * two are one sheet because the second is the first with boxes: what
 * you have, how many, then a note and one button. The offer goes as
 * ONE call with every card in it, so the poster gets one line in the
 * thread and not three.
 *
 * Owners, showcase posts and finished hunts get the list and nothing
 * to press: there is nothing to offer on any of them.
 */
export function FlareCardsSheet({
  open,
  onClose,
  onChanged,
}: {
  open: (FlareSheetPost & { mode: "view" | "offer" }) | null;
  onClose: () => void;
  /** An offer landed; the list behind the sheet should re-read. */
  onChanged?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [stage, setStage] = useState<"list" | "review" | "sent">("list");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  /* A fresh open is a fresh sheet: nothing picked, nothing typed. */
  useEffect(() => {
    if (!open) return;
    setSelecting(open.mode === "offer");
    setPicked({});
    setStage("list");
    setMessage("");
    setError(null);
    setOutcome(null);
  }, [open]);

  if (!open) return null;

  const canOffer = !open.yours && open.direction === "want" && !open.completed;
  const offerable = (card: FeedCard) =>
    canOffer &&
    Boolean(card.flareId) &&
    card.state !== "found" &&
    remainingOf(card) > 0;
  const chosen = open.cards.filter((card) => card.flareId && picked[card.flareId]);
  const copies = chosen.reduce(
    (sum, card) => sum + (picked[card.flareId ?? ""] ?? 0),
    0,
  );

  const send = async () => {
    setError(null);
    const items = chosen.map((card) => ({
      flareId: card.flareId ?? "",
      quantity: picked[card.flareId ?? ""] ?? 1,
    }));
    try {
      const result = await offerItemsOnPost(open.postId, items, message.trim());
      const refused = (result.refused ?? []).map(
        (flareId) =>
          open.cards.find((card) => card.flareId === flareId)?.cardName ?? "one card",
      );
      setOutcome(
        refused.length > 0
          ? `Offered ${cardsLabel(result.offered ?? items.length - refused.length)}. Not taken: ${refused.join(", ")}.`
          : `Offered ${cardsLabel(result.offered ?? items.length)}. ${open.posterName} can see your name.`,
      );
      setStage("sent");
      onChanged?.();
    } catch (caught) {
      setError(`That did not send (${describeError(caught)}). Try again.`);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
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
              <Title>
                {stage === "review"
                  ? "Your offer"
                  : stage === "sent"
                    ? "Sent"
                    : selecting
                      ? "What do you have?"
                      : `${cardsLabel(open.cards.length)}`}
              </Title>
              <Tap onPress={onClose} hitSlop={8} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Tap>
            </View>

            {stage === "sent" ? (
              <>
                <Muted>{outcome}</Muted>
                <Button label="Done" onPress={onClose} />
              </>
            ) : stage === "review" ? (
              <>
                <ScrollView
                  style={{ flexGrow: 0 }}
                  contentContainerStyle={{ gap: spacing(2) }}
                >
                  {chosen.map((card) => (
                    <View
                      key={card.cardId}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: spacing(2),
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        style={{ color: colors.textPrimary, fontSize: 14, flex: 1 }}
                      >
                        {card.cardName}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                        {copiesLabel(picked[card.flareId ?? ""] ?? 1)}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
                <Input
                  value={message}
                  onChangeText={setMessage}
                  placeholder="A note, like where you will be (optional)"
                  maxLength={280}
                  multiline
                  style={{ minHeight: 64, textAlignVertical: "top" }}
                />
                <View style={{ flexDirection: "row", gap: spacing(2) }}>
                  <View style={{ flex: 1 }}>
                    <AsyncButton
                      label="Send offer"
                      pendingLabel="Sending…"
                      onPress={send}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Back"
                      variant="secondary"
                      onPress={() => setStage("list")}
                    />
                  </View>
                </View>
                <ErrorLine message={error} />
              </>
            ) : (
              <>
                <ScrollView
                  style={{ flexGrow: 0 }}
                  contentContainerStyle={{ gap: spacing(2) }}
                >
                  {open.cards.map((card) => {
                    const key = card.flareId ?? card.cardId;
                    const count = picked[key] ?? 0;
                    const remaining = remainingOf(card);
                    const can = selecting && offerable(card);
                    return (
                      <View
                        key={card.cardId}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: spacing(2.5),
                          borderRadius: radius.control,
                          borderWidth: 1,
                          borderColor: count > 0 ? colors.accent : colors.border,
                          backgroundColor: colors.elevated,
                          padding: spacing(2),
                          opacity: selecting && !can ? 0.6 : 1,
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
                          <Text
                            numberOfLines={1}
                            style={{
                              color: colors.textPrimary,
                              fontWeight: "700",
                              fontSize: 14,
                            }}
                          >
                            {card.cardName}
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={{ color: colors.textMuted, fontSize: 12 }}
                          >
                            {printingLabel(card.printingLabel)}
                          </Text>
                          <Text
                            style={{
                              color:
                                remaining === 0 && open.direction === "want"
                                  ? colors.textMuted
                                  : colors.accent,
                              fontSize: 12,
                              fontWeight: "600",
                            }}
                          >
                            {open.direction === "showcase"
                              ? card.state === "found"
                                ? GONE_LABEL
                                : availableLabel(copiesOf(card))
                              : card.state === "found"
                                ? "Found"
                                : needLabel(remaining)}
                          </Text>
                          {card.youOffered ? (
                            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                              You said you have this
                            </Text>
                          ) : null}
                        </View>
                        {can ? (
                          <View style={{ alignItems: "flex-end", gap: spacing(1.5) }}>
                            <Tap
                              onPress={() =>
                                setPicked((current) => {
                                  const next = { ...current };
                                  if (count > 0) delete next[key];
                                  else next[key] = 1;
                                  return next;
                                })
                              }
                              accessibilityLabel={
                                count > 0
                                  ? `Unselect ${card.cardName}`
                                  : `I have ${card.cardName}`
                              }
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 14,
                                borderWidth: 1,
                                borderColor:
                                  count > 0 ? colors.accent : colors.borderStrong,
                                backgroundColor:
                                  count > 0 ? colors.accent : "transparent",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {count > 0 ? (
                                <Ionicons
                                  name="checkmark"
                                  size={16}
                                  color={colors.accentContrast}
                                />
                              ) : null}
                            </Tap>
                            {count > 0 ? (
                              <Stepper
                                value={count}
                                min={1}
                                max={remaining}
                                onChange={(value) =>
                                  setPicked((current) => ({ ...current, [key]: value }))
                                }
                                label={`copies of ${card.cardName} you have`}
                              />
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </ScrollView>

                {selecting ? (
                  <View style={{ gap: spacing(2) }}>
                    <Text
                      style={{
                        color: colors.textPrimary,
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    >
                      {chosen.length > 0
                        ? selectionLabel(chosen.length, copies)
                        : "Pick the cards you have."}
                    </Text>
                    <Button
                      label="Continue to offer"
                      disabled={chosen.length === 0}
                      onPress={() => setStage("review")}
                    />
                  </View>
                ) : canOffer ? (
                  <Button label="Offer cards" onPress={() => setSelecting(true)} />
                ) : open.completed && open.direction === "want" ? (
                  <Muted>All found. Nothing left to offer on.</Muted>
                ) : null}
              </>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
