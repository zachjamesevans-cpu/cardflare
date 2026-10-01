import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { colors, radius, spacing } from "./theme";
import { Tap } from "./ui";

/**
 * "Taken down. Undo", for a minute.
 *
 * The audit of 2026-10-01: "Remove" on a Flare marked it found and told
 * followers, and a wrong post had no way out. Take down is the way out,
 * and this is its safety net: the server reopens rows the same player
 * took down within the last minute (`UNDO_WINDOW_MS` in
 * src/lib/flares/withdraw.ts), so the toast lives exactly that long and
 * then takes the offer with it. The Feed and the Room both draw it; the
 * website's `undo-toast.tsx` is the same strip above the tab bar.
 *
 * Fixed to the bottom of the screen rather than inside the list, so a
 * scroll cannot carry it away before the person has read it. The caller
 * says how far up it sits, because the Room has an action bar to clear
 * and the Feed has the floating tab bar.
 */

/** The server's undo window, mirrored so the toast cannot outlive it. */
export const UNDO_WINDOW_MS = 60 * 1000;

export interface UndoOffer {
  /** Changes with every take-down, so a second one restarts the clock. */
  key: string;
  message: string;
  onUndo: () => Promise<void>;
}

export function UndoToast({
  offer,
  onDismiss,
  bottom,
}: {
  /** Null while there is nothing to undo. */
  offer: UndoOffer | null;
  onDismiss: () => void;
  /** How far above the screen's bottom edge the strip sits. */
  bottom: number;
}) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!offer) return;
    setBusy(false);
    const timer = setTimeout(onDismiss, UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [offer, onDismiss]);

  if (!offer) return null;

  const undo = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await offer.onUndo();
    } finally {
      onDismiss();
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: spacing(3),
        right: spacing(3),
        bottom,
      }}
    >
      <View
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing(3),
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          backgroundColor: colors.elevated,
          paddingVertical: spacing(2.5),
          paddingHorizontal: spacing(4),
          shadowColor: colors.canvas,
          shadowOpacity: 0.5,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Text
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          {offer.message}
        </Text>
        <Tap
          onPress={() => void undo()}
          disabled={busy}
          hitSlop={8}
          accessibilityLabel="Undo"
        >
          <Text
            style={{
              color: colors.accent,
              fontSize: 14,
              fontWeight: "800",
              opacity: busy ? 0.6 : 1,
            }}
          >
            Undo
          </Text>
        </Tap>
        <Tap onPress={onDismiss} hitSlop={8} accessibilityLabel="Dismiss">
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Tap>
      </View>
    </View>
  );
}
