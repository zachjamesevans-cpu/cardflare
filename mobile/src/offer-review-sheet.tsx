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
import { cardsLabel, copiesLabel } from "./flare-copy";
import { offerFailureMessage } from "./offer-copy";
import { colors, radius, spacing } from "./theme";
import { AsyncButton, Button, ErrorLine, Input, Muted, Tap, Title } from "./ui";

/** One line of the offer being reviewed: a card on the post, and how many. */
export interface OfferReviewLine {
  flareId: string;
  name: string;
  quantity: number;
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
 */
export function OfferReviewSheet({
  postId,
  posterName,
  lines,
  onSent,
  onClose,
  onBack,
  send,
}: {
  postId: string;
  posterName: string;
  lines: OfferReviewLine[];
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
                      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                        {copiesLabel(line.quantity)}
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
