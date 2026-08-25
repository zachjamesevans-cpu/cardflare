import { useFonts } from "expo-font";

/**
 * The cardflare wordmark's face.
 *
 * Michroma, matched to the logo art the founder supplied with "make
 * cardflare all lowercase... and make it this font" - chosen by
 * rendering candidate faces against the art, over three rounds the
 * founder judged glyph by glyph (see the layout.tsx note). It ships
 * exactly one weight, which is all a wordmark needs. The website loads
 * the same face through next/font, so the name is one face on both
 * platforms. The website also adds a 0.017em text-stroke for the
 * founder's "slightly bolder"; React Native cannot stroke text, so the
 * app wears Michroma plain - at header size the difference is under a
 * third of a pixel.
 *
 * THE WORDMARK ONLY. Not body text, not headings, not buttons. Inter
 * carries everything a person actually reads; this is the product's
 * name and nothing else, which is what keeps it feeling like a mark
 * rather than a theme.
 *
 * Bundled under the SIL Open Font Licence — see
 * assets/fonts/OFL-Michroma.txt, which ships beside the file because
 * the licence requires it to.
 */
export const BRAND_FONT = "Michroma-Regular";

/**
 * Loads it, and says when it is ready.
 *
 * Never blocks the app. A wordmark is not worth a blank screen, so the
 * header falls back to the system bold until the file is in memory —
 * a few frames on a cold start, and nothing at all afterwards.
 */
export function useBrandFont(): boolean {
  const [loaded] = useFonts({
    [BRAND_FONT]: require("../assets/fonts/Michroma-Regular.ttf"),
  });

  return loaded;
}
