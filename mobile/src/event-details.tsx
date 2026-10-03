import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { LayoutAnimation, Text, View } from "react-native";

import { EVENT_DETAILS } from "./night-copy";
import { SectionLabel } from "./night-section";
import { colors, spacing } from "./theme";
import { Tap } from "./ui";
import { VerifiedMark } from "./verified-mark";

/**
 * Event details, collapsed by default: the website's `<details>` in
 * event-details.tsx. Venue, Address, Organizer, Event code: the facts
 * that used to sit at the top of the page, kept, and put where a
 * glance does not have to read past them.
 */
export function EventDetails({
  storeName,
  verified,
  address,
  code,
  onStore,
}: {
  storeName: string;
  verified?: boolean;
  address: string | null;
  code: string;
  /** The venue row opens the store's page when there is one. */
  onStore?: () => void;
}) {
  const [open, setOpen] = useState(false);

  const rows: { label: string; value: string; onPress?: () => void; mark?: boolean }[] =
    [
      { label: "Venue", value: storeName, onPress: onStore, mark: verified },
      ...(address ? [{ label: "Address", value: address }] : []),
      { label: "Organizer", value: storeName, onPress: onStore },
      { label: "Event code", value: code },
    ];

  return (
    <View style={{ gap: spacing(2) }}>
      <Tap
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setOpen((current) => !current);
        }}
        accessibilityLabel={`${EVENT_DETAILS}${open ? ", open" : ", closed"}`}
      >
        <SectionLabel
          right={
            <Ionicons
              name={open ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.textMuted}
            />
          }
        >
          {EVENT_DETAILS}
        </SectionLabel>
      </Tap>
      {open ? (
        <View>
          {rows.map((row, index) => (
            <View
              key={row.label}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing(3),
                paddingVertical: spacing(2),
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 13, width: 88 }}>
                {row.label}
              </Text>
              <Tap
                onPress={row.onPress}
                disabled={!row.onPress}
                hitSlop={4}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing(1),
                }}
              >
                <Text
                  style={{
                    color: row.onPress ? colors.accent : colors.textPrimary,
                    fontSize: 14,
                    fontWeight: "600",
                    flexShrink: 1,
                  }}
                >
                  {row.value}
                </Text>
                {row.mark ? <VerifiedMark size={14} /> : null}
              </Tap>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
