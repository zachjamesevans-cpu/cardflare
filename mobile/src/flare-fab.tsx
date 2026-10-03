import { Ionicons } from "@expo/vector-icons";
import { Text } from "react-native";

import { POST_A_FLARE } from "./night-copy";
import { colors, gutter, spacing } from "./theme";
import { Tap } from "./ui";

/** The button's own height, for whatever has to clear it: the undo toast. */
export const FAB_HEIGHT = 48;

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
export function FlareFab({ onPress, bottom }: { onPress: () => void; bottom: number }) {
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={POST_A_FLARE}
      style={{
        position: "absolute",
        right: gutter + spacing(2),
        bottom,
        height: FAB_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(1),
        paddingLeft: spacing(3),
        paddingRight: spacing(4),
        borderRadius: FAB_HEIGHT / 2,
        backgroundColor: colors.accent,
        shadowColor: colors.canvas,
        shadowOpacity: 0.45,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      }}
    >
      <Ionicons name="add" size={22} color={colors.accentContrast} />
      <Text style={{ color: colors.accentContrast, fontSize: 15, fontWeight: "800" }}>
        Flare
      </Text>
    </Tap>
  );
}
