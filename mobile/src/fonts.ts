import { useFonts } from "expo-font";

/**
 * Satoshi, for headings and names: the founder's test (2026-11-22), "do
 * satoshi on both to test". Fontshare's official OTFs, embedded as its
 * ITF Free Font License allows (never converted or subset). The website
 * self-hosts the same face (src/app/layout.tsx).
 *
 * A face per weight: with a custom family, iOS picks the file by name,
 * so a style names the face and leaves fontWeight out.
 */
export const DISPLAY = "Satoshi-Bold";
export const DISPLAY_HEAVY = "Satoshi-Black";
export const DISPLAY_MEDIUM = "Satoshi-Medium";

/** Loads the three faces once, at the root. True when ready (or failed). */
export function useDisplayFonts(): boolean {
  const [loaded, error] = useFonts({
    [DISPLAY]: require("../assets/fonts/Satoshi-Bold.otf"),
    [DISPLAY_HEAVY]: require("../assets/fonts/Satoshi-Black.otf"),
    [DISPLAY_MEDIUM]: require("../assets/fonts/Satoshi-Medium.otf"),
  });
  /* A font that fails to load must not hold the app: system text instead. */
  return loaded || Boolean(error);
}
