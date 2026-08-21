import { useFonts } from "expo-font";

/**
 * The CardFlare wordmark's face.
 *
 * Chakra Petch, the founder's ask: "choose a cooler font for cardflare
 * for the top 'CardFlare' text in the feed". Angular cuts and flat
 * terminals — it reads as competitive and technical without the sci-fi
 * costume of the usual gaming faces, and unlike most display types it
 * is still legible at the 17pt a navigation title gets.
 *
 * THE WORDMARK ONLY. Not body text, not headings, not buttons. Inter
 * carries everything a person actually reads; this is the product's
 * name and nothing else, which is what keeps it feeling like a mark
 * rather than a theme.
 *
 * Bundled under the SIL Open Font Licence — see assets/fonts/OFL.txt,
 * which ships beside the files because the licence requires it to.
 */
export const BRAND_FONT = "ChakraPetch-Bold";

/**
 * Loads it, and says when it is ready.
 *
 * Never blocks the app. A wordmark is not worth a blank screen, so the
 * header falls back to the system bold until the file is in memory —
 * a few frames on a cold start, and nothing at all afterwards.
 */
export function useBrandFont(): boolean {
  const [loaded] = useFonts({
    [BRAND_FONT]: require("../assets/fonts/ChakraPetch-Bold.ttf"),
  });

  return loaded;
}
