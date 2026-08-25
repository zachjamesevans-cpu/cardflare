import { useFonts } from "expo-font";

/**
 * The cardflare wordmark's face.
 *
 * Audiowide, matched to the logo art the founder supplied with "make
 * cardflare all lowercase... and make it this font" - wide, flat-topped
 * and squared, and it ships exactly one weight, which is all a wordmark
 * needs. It replaced Chakra Petch, which was matched to the previous
 * mark. The website loads the same face through next/font, so the name
 * is one face on both platforms.
 *
 * THE WORDMARK ONLY. Not body text, not headings, not buttons. Inter
 * carries everything a person actually reads; this is the product's
 * name and nothing else, which is what keeps it feeling like a mark
 * rather than a theme.
 *
 * Bundled under the SIL Open Font Licence — see
 * assets/fonts/OFL-Audiowide.txt, which ships beside the file because
 * the licence requires it to.
 */
export const BRAND_FONT = "Audiowide-Regular";

/**
 * Loads it, and says when it is ready.
 *
 * Never blocks the app. A wordmark is not worth a blank screen, so the
 * header falls back to the system bold until the file is in memory —
 * a few frames on a cold start, and nothing at all afterwards.
 */
export function useBrandFont(): boolean {
  const [loaded] = useFonts({
    [BRAND_FONT]: require("../assets/fonts/Audiowide-Regular.ttf"),
  });

  return loaded;
}
