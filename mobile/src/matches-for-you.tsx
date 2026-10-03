import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Text, View } from "react-native";

import type { NightMatches } from "./api";
import { MutualMatchBlock } from "./mutual-match";
import {
  MATCHES_FOR_YOU,
  NO_MATCHES,
  SEE_ALL_MATCHES,
  huntingHereLine,
  matchesForYouLine,
  wantYoursLine,
} from "./night-copy";
import { NightSection } from "./night-section";
import { colors, radius, spacing } from "./theme";
import { Button, Tap } from "./ui";

/** How many mutual matches sit inline; the rest wait behind See all. */
export const MUTUAL_INLINE = 3;

/**
 * Matches for you: the first section under a Night's header, and the
 * website's matches-for-you.tsx.
 *
 * The founder (2026-10-03): "THIS SHOULD BE THE MOST IMPORTANT
 * SECTION. Directly under the event header/banner." The count with
 * the flame, the two lines under it, See all matches, then the mutual
 * match blocks. A viewer with nothing to match reads one line and
 * Cardflare keeps looking. Drawn for a signed-in viewer only; the
 * room puts the sign-in pitch here for a guest.
 */
export function MatchesForYou({
  matches,
  onSeeAll,
  onPlayer,
}: {
  /** Null while the first read is on its way. */
  matches: NightMatches | null;
  onSeeAll: () => void;
  onPlayer: (playerId: string) => void;
}) {
  const total = matches?.summary.total ?? 0;
  const mutual = matches?.mutual ?? [];
  const nothing = matches !== null && total === 0 && mutual.length === 0;

  return (
    <NightSection label={MATCHES_FOR_YOU}>
      {matches === null ? (
        <View style={{ paddingVertical: spacing(2), alignItems: "flex-start" }}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      ) : nothing ? (
        <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
          {NO_MATCHES}
        </Text>
      ) : (
        <>
          {/* The one card the page allows besides the mutual block: the
              match count is the thing the founder wants seen first. */}
          <View
            style={{
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              padding: spacing(3.5),
              gap: spacing(2),
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
            >
              <Ionicons name="flame" size={20} color={colors.accent} />
              <Text
                style={{ color: colors.textPrimary, fontSize: 20, fontWeight: "800" }}
              >
                {matchesForYouLine(total)}
              </Text>
            </View>
            {matches.summary.cardsHuntingHere > 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                {huntingHereLine(matches.summary.cardsHuntingHere)}
              </Text>
            ) : null}
            {matches.summary.playersWantYours > 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                {wantYoursLine(matches.summary.playersWantYours)}
              </Text>
            ) : null}
            <Tap
              onPress={onSeeAll}
              accessibilityLabel={SEE_ALL_MATCHES}
              hitSlop={6}
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(1) }}
            >
              <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "700" }}>
                {SEE_ALL_MATCHES}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.accent} />
            </Tap>
          </View>

          {mutual.slice(0, MUTUAL_INLINE).map((match) => (
            <MutualMatchBlock
              key={match.player.playerId}
              match={match}
              onPlayer={onPlayer}
            />
          ))}
          {mutual.length > MUTUAL_INLINE ? (
            <Button
              label={`${SEE_ALL_MATCHES} (${mutual.length - MUTUAL_INLINE} more mutual)`}
              variant="secondary"
              onPress={onSeeAll}
            />
          ) : null}
        </>
      )}
    </NightSection>
  );
}
