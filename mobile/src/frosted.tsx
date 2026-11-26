import { BlurView } from "expo-blur";
import { StyleSheet, View, type ViewStyle } from "react-native";

/**
 * FROSTED GLASS: what a sheet stands on. The screen behind shows
 * through, blurred and darkened, instead of a solid panel. The founder
 * (2026-11-25), of the card sheet: "what do you think about having a
 * unified design language where this also kinda blurs into frame? like
 * how the other stuff is", then option A.
 *
 * The app's one rule since: a picture floats on blur with no panel (the
 * card zoom); anything you work in stands on frosted glass (the card
 * sheet, the composer); pages are solid. The tint is heavy enough that
 * words on it read as clearly as on the solid surface.
 */
export function Frosted({ style }: { style?: ViewStyle } = {}) {
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(17,23,16,0.62)" }]} />
    </View>
  );
}
