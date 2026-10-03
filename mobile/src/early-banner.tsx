import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { LayoutAnimation, Text, View } from "react-native";

import { BOARD_EARLY, BOARD_EARLY_LINE, BOARD_EARLY_LONG } from "./night-copy";
import { colors, radius, spacing } from "./theme";
import { Tap } from "./ui";

/**
 * "Board open early. Post now so players know what to bring." with the
 * long explanation behind the info glyph: the website's
 * early-banner.tsx.
 *
 * The founder (2026-10-03): "REMOVE THE GIANT 'BOARD OPEN EARLY' CARD.
 * Replace it with a small contextual banner ... Tapping the information
 * icon can reveal the longer explanation. Do not permanently show a
 * large paragraph." Drawn in the early phase only; the room decides.
 */
export function EarlyBanner() {
  const [open, setOpen] = useState(false);

  return (
    <View
      style={{
        borderRadius: radius.control,
        backgroundColor: colors.elevated,
        paddingHorizontal: spacing(3),
        paddingVertical: spacing(2),
        gap: spacing(1.5),
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
            {BOARD_EARLY}
          </Text>
          {`. ${BOARD_EARLY_LINE}`}
        </Text>
        <Tap
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setOpen((current) => !current);
          }}
          hitSlop={8}
          accessibilityLabel={open ? "Hide the explanation" : "About the early board"}
        >
          <Ionicons
            name={open ? "information-circle" : "information-circle-outline"}
            size={20}
            color={colors.accent}
          />
        </Tap>
      </View>
      {open ? (
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
          {BOARD_EARLY_LONG}
        </Text>
      ) : null}
    </View>
  );
}
