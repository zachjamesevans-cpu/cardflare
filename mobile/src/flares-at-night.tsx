import { Text, View } from "react-native";

import type { RoomFlare } from "./api";
import { FLARE_FILTERS } from "./night-copy";
import { colors, spacing } from "./theme";
import { Tap } from "./ui";

/**
 * The filter over Flares at this Night: the website's
 * flares-at-night.tsx. All, Hunting (intent "want") or Offering
 * (intent "showcase"), applied on the phone before the board groups
 * what is left under whoever posted it. The tiles and the offer flow
 * are the board's own and are not touched here.
 *
 * The founder (2026-10-03): "'Flares at this Night', the wider event
 * trading board ... Filtering: All / Hunting / Offering. Not the first
 * section; personalized matches always come before the generic Flare
 * feed."
 */
export type FlareFilter = keyof typeof FLARE_FILTERS;

export const FLARE_FILTER_ORDER: FlareFilter[] = ["all", "hunting", "offering"];

/** The Flares a filter keeps. Pure, so the test can run it. */
export function filterFlares<T extends { intent: RoomFlare["intent"] }>(
  flares: T[],
  filter: FlareFilter,
): T[] {
  if (filter === "all") return flares;
  const intent = filter === "hunting" ? "want" : "showcase";
  return flares.filter((flare) => flare.intent === intent);
}

/** What the board says when a filter leaves nothing. */
export function emptyFilterLine(filter: FlareFilter): string {
  return filter === "hunting"
    ? "Nobody is hunting anything here yet."
    : "Nobody is offering anything here yet.";
}

/** The three segments, on the section's label line. */
export function FlareFilterRow({
  value,
  onChange,
}: {
  value: FlareFilter;
  onChange: (filter: FlareFilter) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: 2,
      }}
    >
      {FLARE_FILTER_ORDER.map((filter) => {
        const on = filter === value;
        return (
          <Tap
            key={filter}
            onPress={() => onChange(filter)}
            accessibilityLabel={`${FLARE_FILTERS[filter]}${on ? ", selected" : ""}`}
            style={{
              borderRadius: 999,
              backgroundColor: on ? colors.accent : "transparent",
              paddingHorizontal: spacing(2.5),
              paddingVertical: spacing(1),
            }}
          >
            <Text
              style={{
                color: on ? colors.accentContrast : colors.textSecondary,
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              {FLARE_FILTERS[filter]}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}
