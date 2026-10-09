import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import type { BinderSummary } from "./api";
import { BinderCover } from "./binder-cover";
import { EVENT_ONLY_TAG } from "./night-binder-copy";
import { colors, radius, spacing } from "./theme";
import { Tap } from "./ui";

/**
 * Every binder as a row: the app's half of
 * src/components/binder/binder-list.tsx, same rows, same words, same
 * order. The small cover with the name on it, the name, how many
 * cards, and on the owner's own rows which way the switch is: a lime
 * "Up for trade" chip when on, "Private" in muted text when off. A
 * visitor is handed only the binders up for trade, so their rows
 * carry no chip. The owner's order, as the server gives it. A tap
 * opens the binder.
 *
 * A night's "Binders they're bringing" uses the same rows, with
 * "This Night only" on the private ones a player showed to that night;
 * the caller's `onOpen` carries the night along, because a private
 * binder brought to a night opens only through it.
 */
export function BinderList({
  binders,
  yours,
  onOpen,
  eventOnly,
}: {
  binders: (Pick<BinderSummary, "id" | "name" | "cover" | "count"> & {
    forTrade?: boolean;
  })[];
  yours: boolean;
  onOpen: (binderId: string) => void;
  /** Binders shown by their owner's choice to one night only. */
  eventOnly?: ReadonlySet<string>;
}) {
  return (
    <View style={{ gap: spacing(2) }}>
      {binders.map((binder) => (
        <Tap
          key={binder.id}
          onPress={() => onOpen(binder.id)}
          accessibilityLabel={binder.name}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing(3),
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            padding: spacing(3),
          }}
        >
          <BinderCover cover={binder.cover} label={binder.name} size="sm" />
          <View style={{ flex: 1, minWidth: 0, gap: spacing(1) }}>
            <Text
              numberOfLines={1}
              style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 15 }}
            >
              {binder.name}
            </Text>
            {/* The chip rides the count line, so the name keeps the row's width. */}
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                {`${binder.count} ${binder.count === 1 ? "card" : "cards"}`}
              </Text>
              {eventOnly?.has(binder.id) ? (
                <View
                  style={{
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.elevated,
                    paddingHorizontal: spacing(2),
                    paddingVertical: 2,
                  }}
                >
                  <Text
                    maxFontSizeMultiplier={1.3}
                    style={{
                      color: colors.textSecondary,
                      fontSize: 11,
                      fontWeight: "700",
                    }}
                  >
                    {EVENT_ONLY_TAG}
                  </Text>
                </View>
              ) : yours ? (
                binder.forTrade ? (
                  <View
                    style={{
                      borderRadius: 999,
                      backgroundColor: colors.accent,
                      paddingHorizontal: spacing(2),
                      paddingVertical: 2,
                    }}
                  >
                    <Text
                      maxFontSizeMultiplier={1.3}
                      style={{
                        color: colors.accentContrast,
                        fontSize: 11,
                        fontWeight: "700",
                      }}
                    >
                      Up for trade
                    </Text>
                  </View>
                ) : (
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>Private</Text>
                )
              ) : null}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Tap>
      ))}
    </View>
  );
}
