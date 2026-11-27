import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { StyleSheet, View } from "react-native";

import { colors } from "./theme";
import { Tap } from "./ui";

/**
 * THE ONE BACKDROP: whatever is behind, blurred and darkened, and the
 * thing in front floating on it with no box. The founder (2026-11-27):
 * "this screen should have the same 'blurred' view - we delete all the
 * black box views. really a goal is to have a unified design language
 * across entire app." The Feed's card zoom (ui.tsx) started it; the card
 * view, the composer's card editor and every sheet's backdrop
 * (SheetBackdrop) draw this.
 */
export const FLOAT_DIM = "rgba(0,0,0,0.45)";
export const FLOAT_BLUR = 40;

export function FloatBackdrop() {
  return (
    <>
      <BlurView
        intensity={FLOAT_BLUR}
        tint="dark"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: FLOAT_DIM }]}
      />
    </>
  );
}

/** The round X over a floating view, top right. */
export function FloatClose({ onPress }: { onPress: () => void }) {
  return (
    <Tap
      onPress={onPress}
      hitSlop={10}
      accessibilityLabel="Close"
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(255,255,255,0.14)",
      }}
    >
      <Ionicons name="close" size={20} color={colors.textPrimary} />
    </Tap>
  );
}
