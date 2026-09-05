import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import type { Me } from "./api";
import { CardImage, Muted, Tap } from "./ui";
import { colors, spacing } from "./theme";

/**
 * One saved Flare, wherever the list is shown.
 *
 * Born inside the room's "Still hunting these?" panel and promoted to a
 * shared component when the Flare tab became the list's home. Same row
 * either place: the stacked Flare row's anatomy — art, name, number,
 * printing — plus the two verbs a saved ask needs. Minus counts all the
 * way down (at one it removes the card outright), and every tap greys
 * the row under a spinner so a slow write never reads as a frozen
 * screen.
 */
export function WantRow({
  want,
  onNudge,
  onDrop,
}: {
  want: Me["wants"][number];
  onNudge: (delta: number) => Promise<void>;
  onDrop: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wantRow}>
      {/* Two layers: dim the row, keep the spinner above it at full
          strength — the same trick every removal wears. */}
      <View
        style={{
          flexDirection: "row",
          gap: spacing(2),
          opacity: busy ? 0.6 : 1,
          filter: busy ? [{ grayscale: 1 }] : undefined,
        }}
      >
        <CardImage
          imageUrl={want.imageUrl}
          width={40}
          name={want.cardName}
          cardNumber={want.cardNumber}
          caption={want.printingLabel ?? "Any printing"}
          note={want.note}
          lookingFor={want.quantity}
        />

        <View style={{ flex: 1, gap: spacing(1) }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: spacing(2),
            }}
          >
            <Text style={styles.wantName} numberOfLines={2}>
              {want.cardName}
            </Text>
            <Tap onPress={() => void run(onDrop)} disabled={busy} hitSlop={8}>
              <Text style={styles.removeLink}>Remove</Text>
            </Tap>
          </View>

          <Muted>
            {`${want.cardNumber} · ${want.printingLabel ?? "Any printing"}`}
          </Muted>

          {want.deckLabel ? <Muted>{want.deckLabel}</Muted> : null}

          {/*
           * The second of the list's two states.
           *
           * "The 'saved wants' section in the settings is kinda redundant,
           * since it's just the flare section, jsut elsewhere." One list
           * now, and this is what makes one list enough: a card saved at
           * home and a card live on a board tonight are the same row in
           * the database and completely different news.
           */}
          {want.postedAt ? (
            <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "600" }}>
              {`Live at ${want.postedAt}`}
            </Text>
          ) : (
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              Saved
            </Text>
          )}

          <View
            style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
          >
            {/* Minus counts all the way down: at one it removes the
                card outright, so the stepper is never a dead end. */}
            <Tap
              onPress={() =>
                void run(want.quantity <= 1 ? onDrop : () => onNudge(-1))
              }
              disabled={busy}
              hitSlop={6}
              style={styles.stepButton}
            >
              <MaterialCommunityIcons
                name="minus"
                size={14}
                color={colors.textSecondary}
              />
            </Tap>
            <Text style={styles.stepCount}>{want.quantity}</Text>
            <Tap
              onPress={() => void run(() => onNudge(1))}
              disabled={busy || want.quantity >= 99}
              hitSlop={6}
              style={[styles.stepButton, want.quantity >= 99 && { opacity: 0.4 }]}
            >
              <MaterialCommunityIcons
                name="plus"
                size={14}
                color={colors.textSecondary}
              />
            </Tap>
          </View>
        </View>
      </View>

      {busy ? (
        <View style={styles.busyOverlay}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wantRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing(2),
  },
  // The Flare row's name scale exactly, so the two lists read as one.
  wantName: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  // The room's Remove link exactly, so the word reads the same everywhere.
  removeLink: {
    color: colors.textMuted,
    textDecorationLine: "underline",
    fontSize: 14,
  },
  stepButton: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCount: {
    minWidth: 20,
    textAlign: "center",
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  busyOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
