import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { peekPlayer, type PeekProfile } from "./api";
import { CosmeticCard } from "./cosmetic-card";
import { EmberBadge } from "./ember-badge";
import { FollowButton } from "./follow-button";
import { PlayerAvatar } from "./player-avatar";
import { CoverBanner, ShowcaseZoom, type ZoomedCard } from "./showcase-zoom";
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
  const [zoomed, setZoomed] = useState<ZoomedCard | null>(null);
  /* True once the shelf's images are warm in the cache. Showing cards
     before that means art and foil popping in one by one, which reads
     as broken - the founder's word was "disorienting". */
  const [shelfReady, setShelfReady] = useState(false);

  useEffect(() => {
    setProfile(null);
    setFailed(false);
    setShelfReady(false);
    if (!playerId) return;

    let live = true;
    peekPlayer(playerId)
      .then(async (result) => {
        if (!live) return;
        setProfile(result);

        /* Prefetch the five shelf images, but never wait forever: after
           four seconds the shelf shows with whatever has arrived. */
        const warm = Promise.all(
          result.showcase
            .slice(0, PEEK_SHELF)
            .map((entry) =>
              entry.imageUrl ? Image.prefetch(entry.imageUrl).catch(() => false) : null,
            ),
        );
        await Promise.race([warm, new Promise((done) => setTimeout(done, 4000))]);
        if (live) setShelfReady(true);
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
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            padding: spacing(4),
            paddingTop: spacing(5),
            gap: spacing(3),
            overflow: "hidden",
          }}
        >
          {/* Their cover, crisp - the founder retired the blur. */}
          {profile?.coverUrl ? (
            <CoverBanner coverUrl={profile.coverUrl} height={86} />
          ) : null}
          {failed ? (
            <Text style={{ color: colors.textMuted }}>
              Could not load their profile right now. Try again in a moment.
            </Text>
          ) : !profile ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <>
              {/* Top-aligned, per the founder: the name line and the badge
                  sit level with the top of the picture's circle. */}
              <View
                style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing(3) }}
              >
                <PlayerAvatar
                  displayName={profile.displayName}
                  seed={profile.playerId}
                  avatarUrl={profile.avatarUrl}
                  frame={profile.frame}
                  ring={profile.ring}
                  aura={profile.aura}
                  ringArt={profile.ringArt}
                  auraArt={profile.auraArt}
                  size={56}
                />
                <View
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: spacing(2),
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      color: colors.textPrimary,
                      fontWeight: "700",
                      fontSize: 16,
                      flexShrink: 1,
                    }}
                  >
                    {profile.displayName}
                  </Text>
                  <EmberBadge earned={profile.embersEarned} />
                </View>
              </View>

              {/* Option C's button; the server sends null for guests
                  and for yourself, hiding it. */}
              <FollowButton playerId={profile.playerId} initial={profile.follow} />

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
                ) : !shelfReady ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing(2),
                      height: Math.round((slotWidth * 84) / 60),
                    }}
                  >
                    <ActivityIndicator color={colors.accent} size="small" />
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                      Loading their showcase…
                    </Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", gap: spacing(1.5) }}>
                    {shelf.map((entry) => (
                      <Pressable
                        key={entry.id}
                        onPress={() =>
                          setZoomed({
                            name: entry.name,
                            imageUrl: entry.imageUrl,
                            frame: entry.frame,
                            holo: entry.holo,
                            effect: profile.effect,
                          })
                        }
                      >
                        <CosmeticCard
                          imageUrl={entry.imageUrl}
                          width={slotWidth}
                          frame={entry.frame}
                          holo={entry.holo}
                          effect={profile.effect}
                        />
                      </Pressable>
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

      <ShowcaseZoom card={zoomed} onClose={() => setZoomed(null)} />
    </Modal>
  );
}
