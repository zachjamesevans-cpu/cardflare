import { Ionicons } from "@expo/vector-icons";
import type { BottomTabHeaderProps } from "@react-navigation/bottom-tabs";
import type { NativeStackHeaderProps } from "@react-navigation/native-stack";
import type { ComponentProps, ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HEADER } from "./header-metrics";
import { colors } from "./theme";
import { Tap } from "./ui";
import { UnreadDot } from "./unread-dot";

/**
 * Every button in every header: one box, one glyph size, centred.
 *
 * The founder: "remove all of these weird 'bubbles' around icons - they
 * all seem kinda off center." The bubbles were iOS 26 wrapping each
 * header button in glass; the off-centre was ours, padding on one side
 * of the glyph. This box has no padding at all: the glyph sits in the
 * middle of a 44pt square, and the square is what gets positioned.
 */
export function HeaderButton({
  icon,
  label,
  onPress,
  color = colors.textPrimary,
  dot = false,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  color?: string;
  /** The accent dot at the glyph's bottom right, for something unread. */
  dot?: boolean;
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        width: HEADER.slot,
        height: HEADER.slot,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View>
        <Ionicons name={icon} size={HEADER.icon} color={color} />
        {dot ? (
          <UnreadDot ring={colors.canvas} style={{ bottom: 0, right: -1 }} />
        ) : null}
      </View>
    </Tap>
  );
}

/**
 * The header, drawn by us on every screen instead of by iOS.
 *
 * iOS 26 puts a glass circle behind every native header button, and the
 * switch Apple gives to turn that off is newer than the navigation
 * library this SDK pins. So the native bar is not used at all: this one
 * is, on pushed screens and tab screens alike, the way the Feed has
 * always drawn its own. The swipe back is the screen's, not the bar's,
 * so it is untouched.
 *
 * Three fixed places: a button box at each edge (HEADER.edge in) and
 * the title centred on the SCREEN, not on whatever room the buttons
 * leave, so a title never shifts because one side has a button and the
 * other does not.
 */
export function AppHeader({
  title,
  left,
  right,
}: {
  title: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        paddingTop: insets.top,
        height: insets.top + HEADER.height,
        backgroundColor: colors.canvas,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          position: "absolute",
          top: insets.top,
          bottom: 0,
          left: HEADER.edge + HEADER.slot,
          right: HEADER.edge + HEADER.slot,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {typeof title === "string" ? (
          <Text
            numberOfLines={1}
            accessibilityRole="header"
            style={{ color: colors.textPrimary, fontSize: 17, fontWeight: "700" }}
          >
            {title}
          </Text>
        ) : (
          title
        )}
      </View>
      {left ? (
        <View
          style={{
            position: "absolute",
            top: insets.top,
            bottom: 0,
            left: HEADER.edge,
            justifyContent: "center",
          }}
        >
          {left}
        </View>
      ) : null}
      {right ? (
        <View
          style={{
            position: "absolute",
            top: insets.top,
            bottom: 0,
            right: HEADER.edge,
            justifyContent: "center",
          }}
        >
          {right}
        </View>
      ) : null}
    </View>
  );
}

/** The title a screen asked for: its own drawing, its name, or the route's. */
function titleOf(
  headerTitle:
    | string
    | ((props: { children: string; tintColor?: string }) => ReactNode)
    | undefined,
  title: string | undefined,
  routeName: string,
): ReactNode {
  const text = title ?? routeName;
  if (typeof headerTitle === "function") {
    return headerTitle({ children: text, tintColor: colors.textPrimary });
  }
  return headerTitle ?? text;
}

/**
 * A pushed screen's header: back on the left whenever there is
 * somewhere to go back to, the screen's own button on the right.
 *
 * Back is a plain chevron in the accent, no words; VoiceOver says
 * "Back".
 */
export function StackHeader({
  options,
  route,
  navigation,
  back,
}: NativeStackHeaderProps) {
  return (
    <AppHeader
      title={titleOf(options.headerTitle, options.title, route.name)}
      left={
        back ? (
          <HeaderButton
            icon="chevron-back"
            label="Back"
            color={colors.accent}
            onPress={() => navigation.goBack()}
          />
        ) : null
      }
      right={options.headerRight?.({
        tintColor: colors.textPrimary,
        canGoBack: Boolean(back),
      })}
    />
  );
}

/** A tab's header: the same bar, with nothing to go back to. */
export function TabHeader({ options, route }: BottomTabHeaderProps) {
  return (
    <AppHeader
      title={titleOf(options.headerTitle, options.title, route.name)}
      right={options.headerRight?.({
        tintColor: colors.textPrimary,
        canGoBack: false,
      })}
    />
  );
}
