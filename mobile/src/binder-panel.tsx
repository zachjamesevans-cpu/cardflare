import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import type { BinderSummary } from "./api";
import { BinderCover } from "./binder-cover";
import { binderCountLine, binderMatchLine } from "./binder-covers";
import { colors, radius, spacing } from "./theme";
import { Tap } from "./ui";

/**
 * The binder on a profile, between the hunts and the showcase: the
 * app's half of src/components/binder/binder-panel.tsx, same rows,
 * same words, same order.
 *
 * The closed cover on the left, the facts on the right: how many
 * cards are in it, how many of them a visitor is hunting, and for the
 * owner whether anyone else can open it. One button opens the binder.
 * A visitor with nothing to see (a private binder, or no account
 * behind the name) gets no panel at all: the server hands over a null
 * summary and this draws nothing.
 *
 * The owner always has the panel, even with nothing in it, because an
 * empty binder is where "Add cards" lives.
 */
export function BinderPanel({
  summary,
  ownerName,
  yours,
  onOpen,
}: {
  summary: BinderSummary | null | undefined;
  ownerName: string;
  yours?: boolean;
  /** The binder screen: yours, or theirs. */
  onOpen: () => void;
}) {
  if (!summary) return null;

  const match = yours ? null : binderMatchLine(summary.onYourHunts);
  const empty = Boolean(yours) && summary.count === 0;
  const button = empty ? "Add cards" : "Open binder";

  return (
    <View
      style={{
        gap: spacing(3),
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.elevated,
        padding: spacing(3),
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing(2) }}>
        <Ionicons
          name="book-outline"
          size={18}
          color={colors.accent}
          style={{ marginTop: 1 }}
        />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 13 }}>
            Binder
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            {binderCountLine(summary.count)}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}>
        <BinderCover
          cover={summary.cover}
          frontImageUrl={summary.frontImageUrl}
          /* The name alone: the panel's small cover has no room for more. */
          label={yours ? "Yours" : ownerName}
          size="sm"
        />
        <View
          style={{ flex: 1, minWidth: 0, gap: spacing(2), alignItems: "flex-start" }}
        >
          {match ? (
            <Text style={{ color: colors.accent, fontWeight: "600", fontSize: 13 }}>
              {match}
            </Text>
          ) : null}
          {yours ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              {summary.isPublic ? "Public" : "Private, only you"}
            </Text>
          ) : null}
          <Tap
            onPress={onOpen}
            accessibilityLabel={button}
            style={{
              borderRadius: radius.control,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              paddingHorizontal: spacing(3.5),
              paddingVertical: spacing(2),
            }}
          >
            <Text
              style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 13 }}
            >
              {button}
            </Text>
          </Tap>
        </View>
      </View>
    </View>
  );
}
