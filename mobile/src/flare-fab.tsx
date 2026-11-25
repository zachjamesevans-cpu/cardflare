import type { Ref } from "react";
import type { View } from "react-native";

import { FLARE_BUTTON, FlareButton } from "./flare-button";

import { POST_A_FLARE } from "./night-copy";
import { colors, gutter, spacing } from "./theme";

/** The button's own height, for whatever has to clear it: the undo toast. */
export const FAB_HEIGHT = FLARE_BUTTON;

/**
 * "+ Flare", floating bottom right above the dock: the website's
 * flare-fab.tsx, and the replacement for the lime action bar.
 *
 * The founder (2026-10-03): "The current giant lime 'Post a Flare' bar
 * is too visually dominant. Replace with a smaller contextual CTA:
 * floating button '+ Flare' ... The bottom navigation already contains
 * Flare; do not duplicate a massive CTA." It opens the same composer,
 * which already attaches the Flare to this night. Drawn only for a
 * signed-in viewer in a writable phase; the room decides.
 */
export function FlareFab({
  onPress,
  bottom,
  tourRef,
}: {
  onPress: () => void;
  bottom: number;
  tourRef?: Ref<View>;
}) {
  /* The same "+ flame" as everywhere else (flare-button.tsx), so a room
     posts through the one button the rest of the app has. */
  return (
    <FlareButton
      label={POST_A_FLARE}
      onPress={onPress}
      outerRef={tourRef}
      style={{ right: gutter + spacing(2), bottom }}
    />
  );
}
