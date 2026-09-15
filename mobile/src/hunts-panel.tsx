import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import type { Hunt } from "./api";
import { colors, radius, spacing } from "./theme";
import { Body, Card, Title } from "./ui";

/**
 * Somebody's hunts, on their profile. The app's half of
 * src/components/players/hunts-panel.tsx - same rows, same words, same
 * order, as everything on both platforms has to be.
 *
 * The founder: "I can go to someone's proifle and they can have a
 * section for their flaregroups with cards they already found, and cards
 * they're still looking for... see like 'Sabo' with the cards, quantit
 * theyre still looking for, and the cards tehy've already found."
 *
 * A hunt with nothing left is not hidden. Finishing one is the good
 * outcome, and a profile that quietly dropped them would only ever show
 * unfinished work.
 */
export function HuntsPanel({
  hunts,
  limit,
  yours,
}: {
  hunts: Hunt[];
  limit?: number;
  yours?: boolean;
}) {
  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing(2),
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
          <Ionicons name="locate-outline" size={16} color={colors.accent} />
          <Title>Hunts</Title>
        </View>
        {limit ? (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {hunts.length} of {limit}
          </Text>
        ) : null}
      </View>

      {hunts.length === 0 ? (
        <Body>
          {yours
            ? "Name a group when you post and every card you add joins it. The set shows up here, with what is left and what you have found."
            : "No hunts yet."}
        </Body>
      ) : (
        <View style={{ gap: spacing(2) }}>
          {hunts.map((hunt) => (
            <View
              key={hunt.name}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing(2),
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.elevated,
                paddingHorizontal: spacing(3),
                paddingVertical: spacing(2.5),
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: colors.textPrimary,
                  fontWeight: "700",
                  flexShrink: 1,
                }}
              >
                {hunt.name}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing(1.5),
                  flexShrink: 0,
                }}
              >
                <Text
                  style={{
                    color: hunt.looking > 0 ? colors.accent : colors.textMuted,
                    fontSize: 12,
                  }}
                >
                  {hunt.looking > 0 ? lookingLabel(hunt) : "All found"}
                </Text>
                {hunt.found > 0 ? (
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    · {hunt.found} found
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

/**
 * "3 left", or "3 left · 5 copies" when somebody wants more than one of
 * something. The copies only show when they differ from the card count,
 * because "3 left · 3 copies" is the same fact twice.
 */
export function lookingLabel(hunt: Hunt): string {
  if (hunt.lookingCopies > hunt.looking) {
    return `${hunt.looking} left · ${hunt.lookingCopies} copies`;
  }
  return `${hunt.looking} left`;
}
