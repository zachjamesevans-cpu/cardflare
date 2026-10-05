import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Text, View } from "react-native";

import type { GiftBar as GiftBarState } from "./api";
import { giftBarCopy } from "./gift-copy";
import { colors, radius, spacing } from "./theme";

/**
 * The green bar from the top of the store console, drawn for an owner
 * holding the app: a beta gift's days, a Founding Store, or the trial's.
 *
 * The words come from gift-copy.ts, which mirrors the website's, so the
 * two say the same thing. One difference, on purpose: where the website
 * has its "Keep Ultra" button, the app says where that button is
 * instead. Buying happens on the website, so there is no link and no
 * button here.
 *
 * Solid accent while Ultra is on; a bordered card once the beta has
 * ended, because a bright bar for something that has stopped would read
 * as the opposite.
 */

/** Where the website's "Keep Ultra" button lives, said rather than linked. */
export const KEEP_ULTRA_LINE =
  "Keep Ultra from Settings in your store console at cardflare.gg.";

type Glyph = ComponentProps<typeof Ionicons>["name"];

const GLYPH: Record<GiftBarState["state"], Glyph> = {
  founding: "sparkles",
  gift: "gift",
  "gift-ended": "gift",
  trial: "timer",
};

export function GiftBar({ bar, storeName }: { bar: GiftBarState; storeName?: string }) {
  const copy = giftBarCopy(bar);
  const ended = bar.state === "gift-ended";

  /* Ink on the lime fill, or the ordinary text colours on the card. */
  const ink = ended ? colors.textPrimary : colors.accentContrast;
  const soft = ended ? colors.textSecondary : colors.accentContrast;
  const quiet = ended ? colors.textMuted : colors.accentContrast;

  return (
    <View
      accessibilityRole="summary"
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing(3),
        backgroundColor: ended ? colors.surface : colors.accent,
        borderColor: colors.accent,
        borderWidth: 1,
        borderRadius: radius.card,
        padding: spacing(4),
      }}
    >
      <Ionicons
        name={GLYPH[bar.state]}
        size={22}
        color={ended ? colors.accent : colors.accentContrast}
        style={{ marginTop: 1 }}
      />
      <View style={{ flex: 1, minWidth: 0, gap: spacing(1) }}>
        {storeName ? (
          <Text
            numberOfLines={1}
            style={{
              color: soft,
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 1.2,
              textTransform: "uppercase",
              opacity: ended ? 1 : 0.8,
            }}
          >
            {storeName}
          </Text>
        ) : null}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            gap: spacing(2),
          }}
        >
          <Text style={{ color: ink, fontSize: 16, fontWeight: "800", flexShrink: 1 }}>
            {copy.title}
          </Text>
          {copy.urgent ? (
            <View
              style={{
                backgroundColor: colors.accentContrast,
                borderRadius: 999,
                paddingHorizontal: spacing(2),
                paddingVertical: 2,
              }}
            >
              <Text
                style={{
                  color: colors.accent,
                  fontSize: 11,
                  fontWeight: "800",
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                }}
              >
                Ends soon
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={{ color: soft, fontSize: 14, lineHeight: 20 }}>{copy.detail}</Text>
        {copy.action ? (
          <Text
            style={{
              color: quiet,
              fontSize: 13,
              lineHeight: 18,
              marginTop: spacing(1),
              opacity: ended ? 1 : 0.75,
            }}
          >
            {KEEP_ULTRA_LINE}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
