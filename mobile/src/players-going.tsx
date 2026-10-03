import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import type { RosterPlayer } from "./api";
import { PLAYERS_GOING, flaresLine, matchesLine, tradeCardsLine } from "./night-copy";
import { NightSection } from "./night-section";
import { PlayerAvatar } from "./player-avatar";
import { colors, spacing } from "./theme";
import { Tap } from "./ui";

/**
 * Players going: compact rows, low on the page, the website's
 * players-going.tsx.
 *
 * The founder (2026-10-03): "Move attendee information LOWER. People
 * should not just appear as names; show why they may matter." So a
 * row is the face, the name, "{n} Flares · {n} trade cards", and
 * "{n} matches" in the accent when there are any. A tap opens the
 * event-facing profile. Nothing to draw means no section, the same
 * rule as every section on the page.
 */
export function PlayersGoing({
  roster,
  matchesByPlayer,
  live,
  onPlayer,
}: {
  roster: RosterPlayer[];
  /** The viewer's matches per player, from the night's matcher, when
      the roster row does not carry its own. */
  matchesByPlayer: Record<string, number>;
  /** Live: away players read as away. Before the night, nobody is. */
  live: boolean;
  onPlayer: (playerId: string) => void;
}) {
  if (roster.length === 0) return null;

  return (
    <NightSection label={PLAYERS_GOING}>
      <View>
        {roster.map((p, index) => {
          const matches =
            p.matches ?? (p.playerId ? (matchesByPlayer[p.playerId] ?? 0) : 0);
          const line = [
            flaresLine(p.flares),
            p.tradeCards !== undefined ? tradeCardsLine(p.tradeCards) : null,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <Tap
              key={p.playerSessionId}
              onPress={p.playerId ? () => onPlayer(p.playerId!) : undefined}
              disabled={!p.playerId}
              accessibilityLabel={p.displayName}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing(2.5),
                paddingVertical: spacing(2),
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <PlayerAvatar
                displayName={p.displayName}
                seed={p.playerId ?? p.playerSessionId}
                avatarUrl={p.avatarUrl}
                frame={p.frame}
                ring={p.ring}
                aura={p.aura}
                size={36}
                dimmed={live && !p.present}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  numberOfLines={1}
                  style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 15 }}
                >
                  {p.displayName}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>{line}</Text>
              </View>
              {matches > 0 ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing(1),
                  }}
                >
                  <Ionicons name="flame" size={13} color={colors.accent} />
                  <Text
                    style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}
                  >
                    {matchesLine(matches)}
                  </Text>
                </View>
              ) : null}
              {p.playerId ? (
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              ) : null}
            </Tap>
          );
        })}
      </View>
    </NightSection>
  );
}
