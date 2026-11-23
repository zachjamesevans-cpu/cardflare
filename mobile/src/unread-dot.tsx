import { Text, View, type ViewStyle } from "react-native";

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

/** What the count says: the number, or "9+" past nine. */
export function unreadLabel(count: number): string {
  return count > 9 ? "9+" : String(count);
}

/**
 * The count on the Messages tab, Instagram's way: the founder, "show you
 * how many messages you have unread on the taskbar on bottom like how it
 * does with instagram dms". The dot's accent and ring, grown into a pill
 * that holds the number of unread messages, "9+" past nine. The website's
 * dock draws the same (src/components/players/player-tabs.tsx).
 */
export function UnreadCount({
  count,
  ring,
  style,
}: {
  count: number;
  ring: string;
  style: ViewStyle;
}) {
  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          minWidth: 18,
          height: 18,
          paddingHorizontal: 4,
          borderRadius: 9,
          backgroundColor: colors.accent,
          borderWidth: 1.5,
          borderColor: ring,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Text
        style={{
          color: colors.accentContrast,
          fontSize: 10,
          fontWeight: "800",
          lineHeight: 12,
        }}
      >
        {unreadLabel(count)}
      </Text>
    </View>
  );
}
