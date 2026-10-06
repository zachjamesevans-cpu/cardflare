import { View, type ViewStyle } from "react-native";

import { colors } from "./theme";

/** The dot's diameter, in points. */
export const UNREAD_DOT = 9;

/**
 * The small accent dot that says something is waiting: on the Messages
 * tab for unread messages, on the Feed's bell for unread notices. No
 * number (the home screen's icon badge carries the count). The thin
 * ring is the colour of whatever it sits on, so it reads as a dot on
 * that surface rather than a smudge on the glyph. Placed by its parent,
 * absolutely, at the glyph's corner.
 */
export function UnreadDot({ ring, style }: { ring: string; style: ViewStyle }) {
  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: UNREAD_DOT,
          height: UNREAD_DOT,
          borderRadius: UNREAD_DOT / 2,
          backgroundColor: colors.accent,
          borderWidth: 1.5,
          borderColor: ring,
        },
        style,
      ]}
    />
  );
}
