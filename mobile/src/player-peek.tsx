import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { peekPlayer, type PeekProfile } from "./api";
import { CosmeticCard } from "./cosmetic-card";
import { PlayerAvatar } from "./player-avatar";
import { Button } from "./ui";
import { colors, radius, spacing } from "./theme";

/**
 * A player, looked at without leaving the room — the website's popup in
 * the app's shape. Tapping somebody on the roster or a board header
 * opens this: their picture wearing their border, their badge, exactly
 * five showcase slots, and a button to the full profile screen for
 * whoever wants more.
 *
 * The shelf is fetched when the popup opens, not with the room, for the
 * same economics as everywhere else: a roster of twelve must not load
 * twelve shelves to serve the one somebody taps.
 */

const PEEK_SHELF = 5;

export function PlayerPeekModal({
  playerId,
  onClose,
  onViewProfile,
}: {
  /** Null when closed. The modal is mounted once and driven by this. */
  playerId: string | null;
  onClose: () => void;
  onViewProfile: (playerId: string) => void;
}) {
  const window = useWindowDimensions();

  const [profile, setProfile] = useState<PeekProfile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setProfile(null);
    setFailed(false);
    if (!playerId) return;

    let live = true;
    peekPlayer(playerId)
      .then((result) => {
        if (live) setProfile(result);
      })
      .catch(() => {
        if (live) setFailed(true);
      });

    return () => {
      live = false;
    };
  }, [playerId]);

  const panelWidth = Math.min(window.width - spacing(8), 380);
  /* Five equal slots across the panel, whatever the phone's width. */
  const slotWidth = Math.floor(
    (panelWidth - spacing(4) * 2 - spacing(1.5) * (PEEK_SHELF - 1)) / PEEK_SHELF,
  );

  const shelf = profile?.showcase.slice(0, PEEK_SHELF) ?? [];
  const emptySlots = Math.max(0, PEEK_SHELF - shelf.length);

  return (
    <Modal
      visible={playerId !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.75)",
          alignItems: "center",
          justifyContent: "center",
          padding: spacing(4),
        }}
      >
        {/* Taps on the panel stay in the panel. */}
        <Pressable
          onPress={() => {}}
          style={{
            width: panelWidth,
            borderRadius: radius.panel,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            padding: spacing(4),
            gap: spacing(3),
          }}
        >
          {failed ? (
            <Text style={{ color: colors.textMuted }}>
              Could not load their profile right now. Try again in a moment.
            </Text>
          ) : !profile ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}
              >
                <PlayerAvatar
                  displayName={profile.displayName}
                  seed={profile.playerId}
                  avatarUrl={profile.avatarUrl}
                  frame={profile.frame}
                  size={56}
                />
                <View style={{ flex: 1, gap: spacing(1) }}>
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 16 }}
                  >
                    {profile.displayName}
                  </Text>
                  <Text style={{ color: colors.accent, fontWeight: "600", fontSize: 12 }}>
                    {`${profile.embersEarned.toLocaleString()} Embers`}
                  </Text>
                </View>
              </View>

              <View style={{ gap: spacing(1.5) }}>
                <Text
                  style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 13 }}
                >
                  Showcase
                </Text>

                {profile.showcase.length === 0 ? (
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    Nothing on their shelf yet.
                  </Text>
                ) : (
                  <View style={{ flexDirection: "row", gap: spacing(1.5) }}>
                    {shelf.map((entry) => (
                      <CosmeticCard
                        key={entry.id}
                        imageUrl={entry.imageUrl}
                        width={slotWidth}
                        frame={entry.frame}
                        holo={entry.holo}
                        effect={profile.effect}
                      />
                    ))}
                    {Array.from({ length: emptySlots }).map((_, index) => (
                      <View
                        key={`empty-${index}`}
                        style={{
                          width: slotWidth,
                          height: Math.round((slotWidth * 84) / 60),
                          borderRadius: 6,
                          borderWidth: 1,
                          borderStyle: "dashed",
                          borderColor: colors.border,
                        }}
                      />
                    ))}
                  </View>
                )}
              </View>

              <Button
                label="View full profile"
                variant="secondary"
                onPress={() => onViewProfile(profile.playerId)}
              />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
