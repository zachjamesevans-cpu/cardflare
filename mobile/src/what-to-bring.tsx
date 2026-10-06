import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SheetBackdrop } from "./action-menu";
import { setPacked, type BringCard } from "./api";
import {
  OTHER_PRINTING_YOU,
  PACKED,
  VIEW_LIST,
  WHAT_TO_BRING,
  bringLine,
  wantedByLine,
} from "./night-copy";
import { NightSection } from "./night-section";
import { colors, radius, spacing } from "./theme";
import { CardImage, SheetClose, Tap, Title } from "./ui";

/** How many rows sit inline; the rest are behind View list. */
export const BRING_INLINE = 3;

/**
 * What to bring: the website's what-to-bring.tsx.
 *
 * The founder (2026-10-03): "Helps users prepare before leaving. If
 * attendees are hunting cards in the user's Trade Binder, show those
 * cards ... Allow marking cards 'Packed'. A simple checklist." The
 * line, three rows, and View list for the whole checklist in a sheet.
 * Packed is a checkbox per card: it paints the moment it is tapped,
 * the server remembers it (night_packing), and a refused write paints
 * the truth back. Drawn only when the list is non-empty; the room
 * decides.
 */
export function WhatToBring({
  eventId,
  bring,
}: {
  eventId: string;
  bring: BringCard[];
}) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  /*
   * Packed, by card, over what the server last said. Kept here rather
   * than in each row so the inline rows and the sheet's rows agree
   * about a card both of them draw.
   */
  const [packed, setPackedState] = useState<Record<string, boolean>>({});
  const inFlight = useRef(new Set<string>());

  /* A fresh read from the server wins over an old optimistic paint,
     unless a tap is still on its way for that card. */
  useEffect(() => {
    setPackedState((current) => {
      const next: Record<string, boolean> = {};
      for (const row of bring) {
        next[row.card.cardId] = inFlight.current.has(row.card.cardId)
          ? (current[row.card.cardId] ?? row.packed)
          : row.packed;
      }
      return next;
    });
  }, [bring]);

  const isPacked = (row: BringCard) => packed[row.card.cardId] ?? row.packed;

  const toggle = async (row: BringCard) => {
    const cardId = row.card.cardId;
    if (inFlight.current.has(cardId)) return;
    const before = isPacked(row);
    const next = !before;
    inFlight.current.add(cardId);
    setPackedState((current) => ({ ...current, [cardId]: next }));
    try {
      await setPacked(eventId, cardId, next);
    } catch {
      setPackedState((current) => ({ ...current, [cardId]: before }));
    } finally {
      inFlight.current.delete(cardId);
    }
  };

  const rows = (list: BringCard[]) =>
    list.map((row, index) => (
      <BringRow
        key={row.card.cardId}
        row={row}
        packed={isPacked(row)}
        first={index === 0}
        onToggle={() => void toggle(row)}
      />
    ));

  return (
    <NightSection label={WHAT_TO_BRING}>
      <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
        {bringLine(bring.length)}
      </Text>
      <View>{rows(bring.slice(0, BRING_INLINE))}</View>
      <Tap
        onPress={() => setOpen(true)}
        accessibilityLabel={VIEW_LIST}
        hitSlop={6}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing(1),
          alignSelf: "flex-start",
        }}
      >
        <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "700" }}>
          {VIEW_LIST}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={colors.accent} />
      </Tap>

      {/* The whole checklist, in a sheet over the page. */}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <SheetBackdrop />
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              maxHeight: "80%",
              borderTopLeftRadius: radius.panel,
              borderTopRightRadius: radius.panel,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              paddingHorizontal: spacing(4),
              paddingTop: spacing(3),
              paddingBottom: Math.max(spacing(4), insets.bottom),
              gap: spacing(2),
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Title>{WHAT_TO_BRING}</Title>
              <SheetClose onPress={() => setOpen(false)} />
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
              {bringLine(bring.length)}
            </Text>
            <ScrollView>{rows(bring)}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </NightSection>
  );
}

/** One card to pack: the box, the art, the name and number, who wants it. */
function BringRow({
  row,
  packed,
  first,
  onToggle,
}: {
  row: BringCard;
  packed: boolean;
  first: boolean;
  onToggle: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(3),
        paddingVertical: spacing(2),
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      <Tap
        onPress={onToggle}
        hitSlop={10}
        accessibilityLabel={`${PACKED}${packed ? ", on" : ", off"}: ${row.card.name}`}
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          borderWidth: 1.5,
          borderColor: packed ? colors.accent : colors.borderStrong,
          backgroundColor: packed ? colors.accent : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {packed ? (
          <Ionicons name="checkmark" size={16} color={colors.accentContrast} />
        ) : null}
      </Tap>
      <CardImage
        imageUrl={row.card.imageUrl}
        width={32}
        name={row.card.name}
        cardNumber={row.card.number}
        caption={row.card.printingLabel}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={{
            color: packed ? colors.textMuted : colors.textPrimary,
            fontWeight: "700",
            fontSize: 15,
            textDecorationLine: packed ? "line-through" : "none",
          }}
        >
          {row.card.name}
          <Text style={{ color: colors.textMuted, fontWeight: "400" }}>
            {`  ${row.card.number}`}
          </Text>
        </Text>
        {row.card.match === "other-printing" ? (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {OTHER_PRINTING_YOU}
          </Text>
        ) : null}
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          {wantedByLine(row.wantedBy)}
        </Text>
      </View>
      {packed ? (
        <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>
          {PACKED}
        </Text>
      ) : null}
    </View>
  );
}
