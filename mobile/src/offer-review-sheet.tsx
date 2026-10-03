import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
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
import {
  offerErrorMessage,
  offerItemsOnPost,
  type OfferItem,
  type OfferOutcome,
} from "./api";
import { cardsLabel } from "./flare-copy";
import { offerFailureMessage, selectionSummary } from "./offer-copy";
import { Stepper } from "./stepper";
import { colors, radius, spacing } from "./theme";
import { AsyncButton, Button, ErrorLine, Input, Muted, Tap, Title } from "./ui";

/** One line of the offer being reviewed: a card on the post, and how many. */
export interface OfferReviewLine {
  flareId: string;
  name: string;
  quantity: number;
  /** The most the line allows: what the post still wants of the card. */
  max: number;
}

/**
 * THE REVIEW IS WHERE AN OFFER IS SENT, AND THE ONLY PLACE.
 *
 * The founder, on the card viewer: "the actual commitment should
 * happen later when the user presses 'Send Offer' from the review
 * screen." So the full-list sheet and the viewer both build a list of
 * cards and hand it here, and here is the one note field, the one
 * "Send offer" button, and the one "Sending…" that follows the server.
 *
 * The send goes through `send` when a screen hands one (the Feed's
 * post ref, which reloads the Feed behind the result) and through the
 * post's own door otherwise. Either way it is ONE call with every
 * line, so the poster gets one notice that counts the cards.
 *
 * THE REVIEW IS ALSO WHERE THE NUMBER IS RAISED. The audit of
 * 2026-10-02: "Viewer offers always send 1 copy... The review shows
 * '1 copy' as plain text, with no stepper." So every line has the
 * app's one Stepper, capped at what the line allows, and a Remove,
 * and the summary under them reads "2 cards · 3 copies". The caller
 * owns the picks and hears every change through `onChange`; taking
 * the last line out closes the review, since there is nothing left to
 * send.
 */
export function OfferReviewSheet({
  postId,
  posterName,
  lines,
  onChange,
  onSent,
  onClose,
  onBack,
  send,
}: {
  postId: string;
  posterName: string;
  lines: OfferReviewLine[];
  /** A line's count was changed, or, at 0, the line was removed. */
  onChange: (flareId: string, quantity: number) => void;
  /**
   * The server answered: how many it took and the flareIds it would
   * not. The caller marks its cards from this, and may close the
   * review at once (the viewer does: its strip is the confirmation).
   */
  onSent: (outcome: OfferOutcome) => void;
  /** Leave the review for good: the X, and "Done" once sent. */
  onClose: () => void;
  /** "Back", before anything is sent. The X's close when not given. */
  onBack?: () => void;
  /** The door the offer goes through; the post's own when not given. */
  send?: (items: OfferItem[], message: string) => Promise<OfferOutcome>;
}) {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  const nameOf = (flareId: string) =>
    lines.find((line) => line.flareId === flareId)?.name ?? "one card";
  const copies = lines.reduce((sum, line) => sum + line.quantity, 0);

  /* Removing the last line leaves nothing to send: back to the list
     where there is one, out of the review otherwise. */
  const remove = (flareId: string) => {
    onChange(flareId, 0);
    if (lines.length === 1) (onBack ?? onClose)();
  };

  const submit = async () => {
    setError(null);
    const items = lines.map((line) => ({
      flareId: line.flareId,
      quantity: line.quantity,
    }));
    try {
      const result = send
        ? await send(items, message.trim())
        : await offerItemsOnPost(postId, items, message.trim());
      const refused = result.refused ?? [];
      const offered = result.offered ?? items.length - refused.length;
      if (offered === 0) {
        setError(offerFailureMessage("nothing-left"));
        return;
      }
      setOutcome(
        refused.length > 0
          ? `Offered ${cardsLabel(offered)}. Not taken: ${refused.map(nameOf).join(", ")}.`
          : `Offered ${cardsLabel(offered)}. ${posterName} can see your name.`,
      );
      onSent({ offered, refused });
    } catch (caught) {
      setError(offerErrorMessage(caught));
    }
  };

  return (
    /* Fade, not slide: a sliding Modal carries its backdrop up with it,
       which was the black wall the founder saw. */
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
              <Title>{outcome ? "Sent" : "Your offer"}</Title>
              <Tap onPress={onClose} hitSlop={8} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Tap>
            </View>

            {outcome ? (
              <>
                <Muted>{outcome}</Muted>
                <Button label="Done" onPress={onClose} />
              </>
            ) : (
              <>
                <ScrollView
                  style={{ flexGrow: 0 }}
                  contentContainerStyle={{ gap: spacing(2) }}
                >
                  {lines.map((line) => (
                    <View
                      key={line.flareId}
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
                        {line.name}
                      </Text>
                      <Stepper
                        value={line.quantity}
                        min={1}
                        max={Math.max(1, line.max)}
                        onChange={(value) => onChange(line.flareId, value)}
                        label={`copies of ${line.name} you have`}
                      />
                      <Tap
                        onPress={() => remove(line.flareId)}
                        hitSlop={8}
                        accessibilityLabel={`Remove ${line.name}`}
                        style={{ paddingVertical: spacing(1), paddingLeft: spacing(1) }}
                      >
                        <Text
                          style={{
                            color: colors.textSecondary,
                            fontSize: 13,
                            fontWeight: "600",
                          }}
                        >
                          Remove
                        </Text>
                      </Tap>
                    </View>
                  ))}
                </ScrollView>
                {/* "2 cards · 3 copies": no "selected", so it fits a
                    phone's width on one line. */}
                <Text
                  style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "600" }}
                >
                  {selectionSummary(lines.length, copies)}
                </Text>
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
                      disabled={lines.length === 0}
                      onPress={submit}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Back"
                      variant="secondary"
                      onPress={onBack ?? onClose}
                    />
                  </View>
                </View>
                <ErrorLine message={error} />
              </>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
