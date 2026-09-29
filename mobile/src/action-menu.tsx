import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing } from "./theme";
import { Tap } from "./ui";

/**
 * The three dots, and the sheet behind them.
 *
 * A post's extras go here, the way every social app keeps them. The
 * founder, pointing at Instagram's post menu: "nest all of this in a 3
 * dot menu in top right... only visible when you need it." So the card
 * shows what it is, and the things you can DO to it wait behind one
 * glyph in the corner. The website draws the same
 * (src/components/ui/menu.tsx).
 */

export interface ActionItem {
  key: string;
  label: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
}

/** The glyph in the corner. Renders nothing when there is nothing to offer. */
export function DotsButton({
  onPress,
  label = "More",
}: {
  onPress: (() => void) | null;
  label?: string;
}) {
  if (!onPress) return null;
  return (
    <Tap onPress={onPress} hitSlop={8} accessibilityLabel={label}>
      <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
    </Tap>
  );
}

/** The rows, rising from the bottom the way a phone expects them to. */
export function ActionSheet({
  items,
  onClose,
}: {
  /** Null while closed. */
  items: ActionItem[] | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!items) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          justifyContent: "flex-end",
          padding: spacing(3),
          paddingBottom: Math.max(spacing(3), insets.bottom),
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.borderStrong,
              marginTop: spacing(2),
              marginBottom: spacing(1),
            }}
          />
          {items.map((item, index) => (
            <Tap
              key={item.key}
              onPress={() => {
                onClose();
                item.onPress();
              }}
              accessibilityLabel={item.label}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing(3),
                paddingHorizontal: spacing(4),
                paddingVertical: spacing(3.5),
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <Ionicons name={item.icon} size={22} color={colors.textPrimary} />
              <Text
                style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "500" }}
              >
                {item.label}
              </Text>
            </Tap>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
