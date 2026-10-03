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

import { SheetBackdrop } from "./action-menu";
import type { FeedCard } from "./api";
import { copiesOf, remainingOf } from "./flare-deck-pager";
import { availableLabel, cardsLabel, GONE_LABEL, printingLabel } from "./flare-copy";
import { reviewLabel, selectionSummary, wantsLine } from "./offer-copy";
import { OfferReviewSheet } from "./offer-review-sheet";
import { RemoteImage } from "./remote-image";
import { Stepper } from "./stepper";
import { colors, radius, spacing } from "./theme";
import { Button, Muted, Tap, Title } from "./ui";

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
 * "View all 3" (and "See all 3 cards" on the carousel) opens it to
 * read; "Offer cards" opens it to pick. The two are one sheet because
 * the second is the first with a toggle on every row, reading
 * "I have this card" and then "Added to your offer" with the check,
 * how many, then "Review offer · N cards" into the review
 * (`OfferReviewSheet`, the same one the card viewer opens), where the
 * note and the one "Send offer" live. The same words as the viewer and
 * the hunt page, on purpose: the audit found "two wordings for one
 * action". The offer goes as ONE call with every card in it, so the
 * poster gets one line in the thread and not three.
 *
 * THE ROWS DO NOT JUMP. Every row reserves its stepper's space, drawn
 * disabled and dimmed until the row is ticked, so ticking one changes
 * nothing below it: the audit, "ticking a card expands a stepper and
 * pushes the rows down, so my next tap missed." The review button is
 * drawn from the start too, disabled until something is in.
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
  const [reviewing, setReviewing] = useState(false);

  /* A fresh open is a fresh sheet: nothing picked, nothing in review. */
  useEffect(() => {
    if (!open) return;
    setSelecting(open.mode === "offer");
    setPicked({});
    setReviewing(false);
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

  /* The review takes the sheet's place: one panel at a time, and "Back"
     brings the list, with its ticks, straight back. */
  if (reviewing) {
    return (
      <OfferReviewSheet
        postId={open.postId}
        posterName={open.posterName}
        lines={chosen.map((card) => ({
          flareId: card.flareId ?? "",
          name: card.cardName,
          quantity: picked[card.flareId ?? ""] ?? 1,
          max: remainingOf(card),
        }))}
        onChange={(flareId, quantity) =>
          setPicked((current) => {
            const next = { ...current };
            if (quantity <= 0) delete next[flareId];
            else next[flareId] = quantity;
            return next;
          })
        }
        onSent={() => onChanged?.()}
        onBack={() => setReviewing(false)}
        onClose={onClose}
      />
    );
  }

  return (
    /* Fade, not slide: a sliding Modal carries its backdrop up with it,
       which was the black wall the founder saw. The blur fades in
       behind and the panel with it. */
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <SheetBackdrop />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable onPress={onClose} style={{ flex: 1, justifyContent: "flex-end" }}>
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
                {selecting ? "What do you have?" : `${cardsLabel(open.cards.length)}`}
              </Title>
              <Tap onPress={onClose} hitSlop={8} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Tap>
            </View>

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
                            : wantsLine(copiesOf(card), remaining)}
                        </Text>
                        {card.youOffered ? (
                          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                            You offered this
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
                                ? `Remove ${card.cardName} from your offer`
                                : `Add ${card.cardName} to your offer`
                            }
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 4,
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor:
                                count > 0 ? colors.accent : colors.borderStrong,
                              backgroundColor:
                                count > 0 ? colors.accent : "transparent",
                              paddingHorizontal: spacing(2.5),
                              paddingVertical: 4,
                            }}
                          >
                            {count > 0 ? (
                              <Ionicons
                                name="checkmark"
                                size={12}
                                color={colors.accentContrast}
                              />
                            ) : null}
                            <Text
                              style={{
                                color:
                                  count > 0
                                    ? colors.accentContrast
                                    : colors.textSecondary,
                                fontSize: 12,
                                fontWeight: "700",
                              }}
                            >
                              {count > 0 ? "Added to your offer" : "I have this card"}
                            </Text>
                          </Tap>
                          {/* Always here, disabled until the row is ticked,
                              so the rows below never move. */}
                          <Stepper
                            value={count > 0 ? count : 1}
                            min={1}
                            max={remaining}
                            disabled={count === 0}
                            onChange={(value) =>
                              setPicked((current) => ({ ...current, [key]: value }))
                            }
                            label={`copies of ${card.cardName} you have`}
                          />
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
                      ? selectionSummary(chosen.length, copies)
                      : "Pick the cards you have."}
                  </Text>
                  {/* The accent as soon as one card is in; drawn disabled
                      and dimmed before that, so its space is reserved. */}
                  <View style={{ opacity: chosen.length > 0 ? 1 : 0.45 }}>
                    <Button
                      label={reviewLabel(chosen.length)}
                      disabled={chosen.length === 0}
                      onPress={() => setReviewing(true)}
                    />
                  </View>
                </View>
              ) : canOffer ? (
                <Button label="Offer cards" onPress={() => setSelecting(true)} />
              ) : open.completed && open.direction === "want" ? (
                <Muted>All found. Nothing left to offer on.</Muted>
              ) : null}
            </>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
