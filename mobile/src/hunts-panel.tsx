import { Ionicons } from "@expo/vector-icons";
import { useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  friendlyError,
  type Hunt,
  type HuntCard,
  offerOnHunt,
  serverMessage,
} from "./api";
import { BinderCover } from "./binder-cover";
import { huntCover } from "./binder-covers";
import { API_BASE } from "./config";
import { cardsLabel, copiesLabel, printingLabel } from "./flare-copy";
import { huntRowLine } from "./hunt-copy";
import { HUNT_EXPLAINER, HuntSheet, type HuntSheetMode } from "./hunt-sheet";
import { reviewLabel, selectionSummary } from "./offer-copy";
import { RemoteImage } from "./remote-image";
import { Stepper } from "./stepper";
import { colors, radius, spacing } from "./theme";
import {
  AsyncButton,
  Body,
  Button,
  Card,
  ErrorLine,
  Input,
  Muted,
  Tap,
  Title,
} from "./ui";

/**
 * Somebody's hunts, on their profile. The app's half of
 * src/components/players/hunts-panel.tsx - same rows, same words, same
 * order, as everything on both platforms has to be.
 *
 * A HUNT IS DRAWN LIKE A BINDER. The founder: "Do you think the Hunts
 * feature should just be binders instead of lists? So it's all kinda
 * the same language." So a hunt on this tab is the binder's row, the
 * small cover with the hunt's name embossed on it, the name, the line
 * under it, a chevron, and a tap opens the hunt's own screen with its
 * cards in pockets (hunt-binder.tsx). Nothing opens in place any
 * more. A hunt stays a hunt on the server: cards wanted, Flares posted
 * from it, offers made on it. Only the drawing changed.
 *
 * "Cards" and "copies" are two different numbers everywhere below. A
 * hunt of two cards can want five copies, and the copy never folds
 * one into the other.
 */

export function HuntsPanel({
  hunts,
  limit,
  yours,
  ownerName,
  onAdd,
  onOpen,
  onTick,
  onChanged,
  bare = false,
}: {
  hunts: Hunt[];
  limit?: number;
  yours?: boolean;
  /** Whose hunts these are. Kept in the signature for every caller. */
  ownerName?: string;
  /**
   * Add cards to this hunt: the composer, with the hunt preselected.
   * The rows no longer offer it; the hunt's own screen does, from its
   * "+" pockets. Kept so an older caller still compiles.
   */
  onAdd?: (huntId: string) => void;
  /** A tap on a row: the hunt's own screen. */
  onOpen?: (huntId: string) => void;
  /**
   * The old tick, from before a hunt counted copies. Kept in the
   * signature so an older caller still compiles; the hunt screen
   * writes copies through `setRequestFound` and never calls it.
   */
  onTick?: (flareId: string, found: boolean) => Promise<void>;
  /** Something was written; the owner of the hunts should re-read them. */
  onChanged?: () => void;
  /**
   * Drawn inside a profile pane, whose tab already says "Hunts": no
   * card around it and no heading, so New hunt sits exactly where New
   * binder sits on the Binders pane beside it.
   */
  bare?: boolean;
}) {
  void onTick;
  void onAdd;
  void ownerName;
  /* New hunt, Edit hunt or What's a hunt?, as a sheet from the bottom
     (hunt-sheet.tsx). It was a bare name field in the pane's top row. */
  const [sheet, setSheet] = useState<HuntSheetMode | null>(null);

  const atLimit = typeof limit === "number" && hunts.length >= limit;

  const Shell = bare ? BareShell : Card;

  return (
    <Shell>
      {/*
       * One slim row: how many of your allowance, the way to ask what a
       * hunt is, and New hunt at its end - not a full-width green bar.
       * A visitor's pane says only what there is.
       */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing(2),
        }}
      >
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: spacing(2), flexShrink: 1 }}
        >
          {bare ? null : (
            <Ionicons name="locate-outline" size={16} color={colors.accent} />
          )}
          {bare ? null : <Title>Hunts</Title>}
          {yours && limit ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              {`${hunts.length} of ${limit} hunts`}
            </Text>
          ) : null}
          {yours ? (
            <Tap
              onPress={() => setSheet({ kind: "about" })}
              hitSlop={8}
              accessibilityLabel="What's a hunt?"
            >
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600" }}>
                {"· What’s a hunt?"}
              </Text>
            </Tap>
          ) : null}
        </View>
        {yours ? (
          <Tap
            onPress={() => setSheet({ kind: "new" })}
            disabled={atLimit}
            accessibilityLabel="New hunt"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing(1),
              borderRadius: 999,
              borderWidth: 1,
              borderColor: atLimit ? colors.border : colors.accent,
              paddingHorizontal: spacing(3),
              paddingVertical: spacing(1.5),
              opacity: atLimit ? 0.5 : 1,
            }}
          >
            <Ionicons name="add" size={16} color={colors.accent} />
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
              New hunt
            </Text>
          </Tap>
        ) : null}
      </View>
      {yours && atLimit ? (
        <Muted>{`You are at ${limit} hunts. Finish one to start another.`}</Muted>
      ) : null}

      {hunts.length === 0 ? (
        <Body>{yours ? HUNT_EXPLAINER : "No hunts yet."}</Body>
      ) : (
        <View style={{ gap: spacing(2) }}>
          {hunts.map((hunt) => (
            <HuntRow
              key={keyOf(hunt)}
              hunt={hunt}
              onOpen={() => {
                if (hunt.id) onOpen?.(hunt.id);
              }}
            />
          ))}
        </View>
      )}

      <HuntSheet
        mode={sheet}
        onClose={() => setSheet(null)}
        onNew={() => setSheet({ kind: "new" })}
        onStarted={(huntId) => {
          onChanged?.();
          onOpen?.(huntId);
        }}
        onSaved={() => onChanged?.()}
      />
    </Shell>
  );
}

/** A pane's own spacing, in place of the card a standalone panel wears. */
function BareShell({ children }: { children: ReactNode }) {
  return <View style={{ gap: spacing(3) }}>{children}</View>;
}

/** An older server sends hunts without ids; the name still keys the row. */
function keyOf(hunt: Hunt | undefined): string | null {
  if (!hunt) return null;
  return hunt.id ?? hunt.name;
}

/**
 * One hunt as a compact row: a small cover with its name on it, the
 * name, and how far along - "3 of 17 found" over a slim bar - which is
 * the whole reason a hunt exists. A row was a binder-sized cover and a
 * line, a screen and a half for two hunts. No visibility chip: every hunt is
 * public. A tap opens the hunt.
 */
function HuntRow({ hunt, onOpen }: { hunt: Hunt; onOpen: () => void }) {
  const cards = hunt.looking + hunt.found;
  const share = cards > 0 ? hunt.found / cards : 0;
  return (
    <Tap
      onPress={onOpen}
      accessibilityLabel={`${hunt.name}, ${huntRowLine(cards, hunt.looking)}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(3),
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: spacing(2.5),
      }}
    >
      <BinderCover cover={huntCover(hunt.id ?? hunt.name)} label={hunt.name} size="xs" />
      <View style={{ flex: 1, minWidth: 0, gap: spacing(1.5) }}>
        <Text
          numberOfLines={1}
          style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 15 }}
        >
          {hunt.name}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
          {cards === 0 ? "No cards yet" : `${hunt.found} of ${cardsLabel(cards)} found`}
        </Text>
        {cards > 0 ? (
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: cards, now: hunt.found }}
            style={{
              height: 5,
              borderRadius: 3,
              backgroundColor: colors.elevated,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${Math.round(share * 100)}%`,
                height: "100%",
                backgroundColor: colors.accent,
              }}
            />
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Tap>
  );
}

/** Copies wanted for one card, from whichever field the server sent. */
export const neededOf = (card: HuntCard): number =>
  Math.max(1, card.needed ?? card.quantity ?? 1);

/** Copies in hand for one card, before any local change. */
export const foundOf = (card: HuntCard): number =>
  card.foundCopies ?? (card.found ? neededOf(card) : 0);

/** A hunt's public address, the one Share hands out. */
export function huntUrl(huntId: string): string {
  return `${API_BASE}/hunts/${encodeURIComponent(huntId)}`;
}

/** The line that offers to put the last change back, for a few seconds. */
export function UndoLine({ label, onUndo }: { label: string; onUndo: () => void }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(2),
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: colors.accentMuted,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing(3),
        paddingVertical: spacing(2),
      }}
    >
      <Text
        numberOfLines={1}
        style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}
      >
        {label}
      </Text>
      <Tap onPress={onUndo} hitSlop={6} accessibilityLabel="Undo the last change">
        <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
          Undo
        </Text>
      </Tap>
    </View>
  );
}

/** "5 of 10 copies collected", and a slim bar saying the same. */
export function HuntProgress({ found, needed }: { found: number; needed: number }) {
  const share = needed > 0 ? Math.min(1, found / needed) : 0;
  return (
    <View style={{ gap: spacing(1.5) }}>
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
        {`${found} of ${copiesLabel(needed)} collected`}
      </Text>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: needed, now: found }}
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: colors.elevated,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${Math.round(share * 100)}%`,
            height: "100%",
            backgroundColor: colors.accent,
          }}
        />
      </View>
    </View>
  );
}

/** The bar under a visitor's selection: what is picked, and the door on. */
export function HuntOfferFooter({
  cards,
  copies,
  onContinue,
}: {
  cards: number;
  copies: number;
  onContinue: () => void;
}) {
  return (
    <View
      style={{
        gap: spacing(2),
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: colors.accentMuted,
        backgroundColor: colors.surface,
        padding: spacing(3),
      }}
    >
      <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "600" }}>
        {selectionSummary(cards, copies)}
      </Text>
      <Button label={reviewLabel(cards)} onPress={onContinue} />
    </View>
  );
}

/**
 * The review before an offer goes: the picks, a note, one button.
 *
 * ONE call, by request. The server sorts the picks by what it can do
 * with each: a card with a live Flare becomes an offer on its post,
 * the rest go to the owner as one direct message, and the note rides
 * with both because the person reading it is the same either way.
 *
 * THE REVIEW IS ALSO WHERE THE NUMBER IS RAISED, as on a post: every
 * line is the round 16b row, the art 88 x 123 down the left, the
 * name, the printing, and under them the one Stepper, capped at what
 * the hunt still wants of the card, and a Remove. The caller owns the
 * picks and hears every change through `onChange`; taking the last
 * line out closes the review, since there is nothing left to send.
 */
export function HuntOfferReview({
  visible,
  hunt,
  ownerName,
  items,
  onChange,
  onClose,
  onSent,
}: {
  visible: boolean;
  hunt: Hunt;
  ownerName: string;
  items: { card: HuntCard; quantity: number }[];
  /** A line's count was changed, or, at 0, the line was removed. */
  onChange: (requestId: string, quantity: number) => void;
  onClose: () => void;
  onSent: (outcome: { text: string; threadId: string | null }) => void;
}) {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const copies = items.reduce((sum, item) => sum + item.quantity, 0);

  const remove = (requestId: string) => {
    onChange(requestId, 0);
    if (items.length === 1) onClose();
  };

  const send = async () => {
    setError(null);
    const lines = items.flatMap(({ card, quantity }) =>
      card.requestId ? [{ requestId: card.requestId, quantity }] : [],
    );
    if (!hunt.id || lines.length === 0) {
      setError("Pick a card first.");
      return;
    }
    let outcome;
    try {
      outcome = await offerOnHunt(hunt.id, lines, message.trim());
    } catch (caught) {
      /* A 409 is the server declining in words: "That one is yours.",
         "Those cards were all found already." Anything else is a
         failure to diagnose. */
      setError(
        serverMessage(caught) ??
          `That did not send. ${friendlyError(caught)}`,
      );
      return;
    }
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    setMessage("");
    onSent(huntOfferSentLine(outcome, ownerName));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* The sheet rides up with the keyboard, so the note is never
          typed into blind. The founder: "i click the text box and it
          gets covered by the keyboard." */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: colors.scrim,
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.panel,
              borderTopRightRadius: radius.panel,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing(4),
              paddingBottom: spacing(4) + insets.bottom,
              gap: spacing(3),
              maxHeight: "85%",
            }}
          >
            <Title>Your offer</Title>
            <ScrollView
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ gap: spacing(2) }}
            >
              {items.map(({ card, quantity }) => {
                const remaining = Math.max(1, neededOf(card) - foundOf(card));
                return (
                  <View
                    key={card.requestId ?? card.cardId}
                    style={{
                      flexDirection: "row",
                      alignItems: "stretch",
                      gap: spacing(3),
                      borderRadius: radius.control,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.elevated,
                      padding: spacing(3),
                    }}
                  >
                    <View
                      style={{
                        width: 88,
                        height: 123,
                        borderRadius: radius.control / 2,
                        overflow: "hidden",
                        backgroundColor: colors.canvas,
                      }}
                    >
                      <RemoteImage
                        uri={card.imageUrl}
                        contentFit="contain"
                        style={{ width: "100%", height: "100%" }}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: spacing(1.5) }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: colors.textPrimary,
                          fontWeight: "600",
                          fontSize: 14,
                        }}
                      >
                        {card.cardName}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{ color: colors.textMuted, fontSize: 12 }}
                      >
                        {`${card.cardNumber} · ${printingLabel(card.printingLabel)}`}
                      </Text>
                      <View
                        style={{
                          marginTop: "auto",
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: spacing(2),
                        }}
                      >
                        <Stepper
                          value={quantity}
                          min={1}
                          max={remaining}
                          onChange={(value) => {
                            if (card.requestId) onChange(card.requestId, value);
                          }}
                          label={`copies of ${card.cardName} you have`}
                        />
                        <Tap
                          onPress={() => {
                            if (card.requestId) remove(card.requestId);
                          }}
                          hitSlop={6}
                          accessibilityLabel={`Remove ${card.cardName} from your offer`}
                        >
                          <Text
                            style={{
                              color: colors.danger,
                              fontSize: 12,
                              fontWeight: "600",
                            }}
                          >
                            Remove
                          </Text>
                        </Tap>
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
              {selectionSummary(items.length, copies)}
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
                  onPress={send}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Back" variant="secondary" onPress={onClose} />
              </View>
            </View>
            <ErrorLine message={error} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * What a sent hunt offer says under the pages: how many were offered
 * on a post, that the rest went to the owner in Messages, and what
 * the server would not take.
 */
export function huntOfferSentLine(
  outcome: {
    offered: number;
    messaged: number;
    threadId: string | null;
    refused: string[];
  },
  ownerName: string,
): { text: string; threadId: string | null } {
  const parts: string[] = [];
  if (outcome.offered > 0) parts.push(`Offered ${cardsLabel(outcome.offered)}.`);
  if (outcome.messaged > 0 && outcome.threadId) {
    parts.push(`Sent to ${ownerName} in Messages.`);
  }
  if (outcome.refused.length > 0) {
    parts.push(`Not taken: ${outcome.refused.join(", ")}.`);
  }
  return { text: parts.join(" "), threadId: outcome.threadId };
}
