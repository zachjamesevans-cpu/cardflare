import { Image, View } from "react-native";

import { BACKDROPS } from "./theme";

/**
 * The launch screen's twin, drawn by the app: the cardflare wordmark the
 * Feed wears at its top, on the green-grey every surface in the app
 * uses. The founder (2026-10-15): "update the main 'loading' icon like
 * when you open app for first time ... it's the full cardflare logo that
 * we use for the top of feed, and it has that dark gray green background
 * we use throughout the app."
 *
 * iOS shows the native launch screen (app.json, expo-splash-screen) and
 * then the app's first frames, which are this, while the backdrop and
 * the session are read: the same picture at the same size, so the
 * hand-over cannot be seen. The size and colour are the app.json ones;
 * tests/unit/launch-screen.test.ts holds them together.
 */

/** The wordmark's width on the launch screen, in points. */
export const LAUNCH_WORDMARK_WIDTH = 240;

/* Green-grey even for a player who chose Pure black: the native launch
   screen cannot know the choice, and the two have to match. */
export const LAUNCH_BACKGROUND = BACKDROPS.green.surface;

const WORDMARK = require("../assets/wordmark-soft.png");
const SOURCE = Image.resolveAssetSource(WORDMARK);

export function LaunchView() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: LAUNCH_BACKGROUND,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Image
        source={WORDMARK}
        accessibilityLabel="cardflare"
        style={{
          width: LAUNCH_WORDMARK_WIDTH,
          height: (LAUNCH_WORDMARK_WIDTH * SOURCE.height) / SOURCE.width,
          resizeMode: "contain",
        }}
      />
    </View>
  );
}
