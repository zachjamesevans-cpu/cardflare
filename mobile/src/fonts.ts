import { useFonts } from "expo-font";
import type { TextStyle } from "react-native";

/**
 * The type, matched to TUKAR's at the founder's request (2026-11-22:
 * "we need to find that exact font from tukar ... go the full match on
 * both"). Their site loads Plus Jakarta Sans for names and headings and
 * Space Grotesk, wide-spaced in capitals, for small labels; so does
 * ours. Both are Google Fonts under the SIL Open Font License; these
 * are Google's static instances, one file per weight. The website
 * loads the same two through next/font (src/app/layout.tsx).
 *
 * A face per weight: with a custom family, iOS picks the file by name,
 * so a style names the face and leaves fontWeight out.
 */
export const DISPLAY = "PlusJakartaSans-Bold";
export const DISPLAY_HEAVY = "PlusJakartaSans-ExtraBold";
export const DISPLAY_SEMI = "PlusJakartaSans-SemiBold";
export const DISPLAY_MEDIUM = "PlusJakartaSans-Medium";
export const CAPS = "SpaceGrotesk-Medium";
export const CAPS_BOLD = "SpaceGrotesk-SemiBold";

/** A small label in wide-spaced capitals: "@MAYA · UNDER 2 MI AWAY". */
export function capsLabel(size = 12, bold = false): TextStyle {
  return {
    fontFamily: bold ? CAPS_BOLD : CAPS,
    fontSize: size,
    letterSpacing: size * 0.14,
    textTransform: "uppercase",
  };
}

/** Loads every face once, at the root. True when ready (or failed). */
export function useDisplayFonts(): boolean {
  const [loaded, error] = useFonts({
    [DISPLAY]: require("../assets/fonts/PlusJakartaSans-Bold.ttf"),
    [DISPLAY_HEAVY]: require("../assets/fonts/PlusJakartaSans-ExtraBold.ttf"),
    [DISPLAY_SEMI]: require("../assets/fonts/PlusJakartaSans-SemiBold.ttf"),
    [DISPLAY_MEDIUM]: require("../assets/fonts/PlusJakartaSans-Medium.ttf"),
    [CAPS]: require("../assets/fonts/SpaceGrotesk-Medium.ttf"),
    [CAPS_BOLD]: require("../assets/fonts/SpaceGrotesk-SemiBold.ttf"),
  });
  /* A font that fails to load must not hold the app: system text instead. */
  return loaded || Boolean(error);
}
