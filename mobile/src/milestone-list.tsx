import { Text, View } from "react-native";

import type { MilestoneBoard } from "./api";
import { colors, spacing } from "./theme";
import { Card, Muted, Title } from "./ui";

/**
 * Milestones in the Embers shop: what pays once, how far along each is,
 * and the pack each badge tier hands over. The website's MilestoneList
 * (src/components/players/milestone-list.tsx) draws the same rows.
 */
export function MilestoneList({ board }: { board: MilestoneBoard }) {
  return (
    <Card>
      <Title>Milestones</Title>
      <Muted>
        Embers once each, for the things cardflare is for. Every badge tier you reach
        puts a sealed pack in your hands.
      </Muted>

      <View style={{ gap: spacing(3) }}>
        {board.milestones.map((milestone) => (
          <View
            key={milestone.key}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}
          >
            <View style={{ flex: 1, minWidth: 0, gap: spacing(1) }}>
              <Text
                style={{
                  color: milestone.done ? colors.textMuted : colors.textPrimary,
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                {milestone.title}
              </Text>
              <View
                accessibilityRole="progressbar"
                accessibilityValue={{
                  min: 0,
                  max: milestone.goal,
                  now: milestone.progress,
                }}
                style={{
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.elevated,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    width: `${(milestone.progress / milestone.goal) * 100}%`,
                    height: "100%",
                    backgroundColor: colors.accent,
                  }}
                />
              </View>
            </View>
            <Text
              style={{
                color: milestone.done ? colors.accent : colors.textSecondary,
                fontSize: 12,
                fontWeight: "700",
                fontVariant: ["tabular-nums"],
              }}
            >
              {milestone.done
                ? "Earned"
                : `${milestone.progress}/${milestone.goal} · +${milestone.embers}`}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(2) }}>
        {board.tiers.map((tier) => (
          <Text
            key={tier.tier}
            style={{
              color: tier.reached ? colors.accent : colors.textMuted,
              backgroundColor: tier.reached ? colors.accentTint : colors.elevated,
              borderColor: tier.reached ? `${colors.accent}59` : colors.border,
              borderWidth: 1,
              borderRadius: 999,
              overflow: "hidden",
              paddingHorizontal: spacing(3),
              paddingVertical: spacing(1),
              fontSize: 12,
              fontWeight: "700",
            }}
          >
            {`${tier.tier} · ${tier.reached ? "pack earned" : `${tier.earned} Embers`}`}
          </Text>
        ))}
      </View>
    </Card>
  );
}
