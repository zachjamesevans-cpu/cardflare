import { useRoute, type RouteProp } from "@react-navigation/native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import { peekPlayer, type PeekProfile } from "../api";
import { CosmeticCard } from "../cosmetic-card";
import { EmberBadge } from "../ember-badge";
import { FollowButton } from "../follow-button";
import { PlayerAvatar } from "../player-avatar";
import { CoverBanner, ShowcaseZoom, type ZoomedCard } from "../showcase-zoom";
import { Body, Card, Muted, Tap, Title } from "../ui";
import { colors, radius, spacing } from "../theme";

/** The trade-room carousel's tile width; the profile shelf matches it. */
const SHELF_TILE = 56;
/** How far the cover reaches: past the name and the Embers badge. */
const COVER_HEIGHT = 280;

/**
 * Somebody else's profile, the full page — where the popup's "View full
 * profile" lands. One block, the founder's layout: their cover banner
 * across the top with the picture overlapping it, the name with the
 * badge directly under it, and the whole shelf as a carousel-sized rail
 * inside the same block. Tapping a card opens the standard full view.
 * The server builds this from a type with no balance field, so this
 * screen could not leak one.
 */
export function PlayerProfileScreen() {
  const route = useRoute<RouteProp<StackParams, "PlayerProfile">>();
  const { playerId } = route.params;

  const [profile, setProfile] = useState<PeekProfile | null>(null);
  const [failed, setFailed] = useState(false);
  /* Cards render together once their art is warm, not one by one. */
  const [shelfReady, setShelfReady] = useState(false);
  const [zoomed, setZoomed] = useState<ZoomedCard | null>(null);

  useEffect(() => {
    let live = true;
    peekPlayer(playerId)
      .then(async (result) => {
        if (!live) return;
        setProfile(result);

        const warm = Promise.all(
          result.showcase.map((entry) =>
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

  if (failed) {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing(4) }}>
        <Card>
          <Body>Could not load this profile right now. Try again in a moment.</Body>
        </Card>
      </ScrollView>
    );
  }

  if (!profile) {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing(4) }}>
        <Muted>Loading…</Muted>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(4) }}>
      {/* The profile block: cover, picture, name, badge, shelf. */}
      <Card style={{ paddingTop: spacing(6), overflow: "hidden" }}>
        {/* The cover carries down behind the picture, the name and the
            badge, then fades into the card. The same block your own
            profile shows: what you see is what they see. */}
        <CoverBanner coverUrl={profile.coverUrl} height={COVER_HEIGHT} fade />

        <View
          style={{
            alignItems: "center",
            gap: spacing(2),
          }}
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
            size={96}
          />
          <Title>{profile.displayName}</Title>
          {/* Centered directly under the name, inside the block. */}
          <EmberBadge earned={profile.embersEarned} size="md" />
          <FollowButton playerId={profile.playerId} initial={profile.follow} />
        </View>

        {/* The showcase panel, same as the website: its own rounded
            rectangle inside the one connected profile block. */}
        <View
          style={{
            gap: spacing(2),
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.elevated,
            padding: spacing(3),
          }}
        >
          <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 13 }}>
            Showcase
          </Text>

          {profile.showcase.length === 0 ? (
            <Muted>Nothing on the shelf yet.</Muted>
          ) : !shelfReady ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}
            >
              <ActivityIndicator color={colors.accent} size="small" />
              <Muted>Loading showcase…</Muted>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: spacing(2) }}>
                {profile.showcase.map((entry) => (
                  <Tap
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
                      width={SHELF_TILE}
                      frame={entry.frame}
                      holo={entry.holo}
                      effect={profile.effect}
                    />
                  </Tap>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </Card>

      <ShowcaseZoom card={zoomed} onClose={() => setZoomed(null)} />
    </ScrollView>
  );
}
