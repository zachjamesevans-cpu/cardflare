import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import { peekPlayer, storedAccessToken, type PeekProfile } from "../api";
import { CosmeticCard } from "../cosmetic-card";
import { FollowButton } from "../follow-button";
import { PlayerAvatar } from "../player-avatar";
import { HeaderButton, ProfileHeader, ShareProfileButton } from "../profile-header";
import { CoverBanner, ShowcaseZoom, type ZoomedCard } from "../showcase-zoom";
import { Body, Card, Muted, Tap } from "../ui";
import { colors, radius, spacing } from "../theme";

/** The trade-room carousel's tile width; the profile shelf matches it. */
const SHELF_TILE = 56;
/** The header's banner: a strip the picture overlaps, the website's short cover. */
const COVER_HEIGHT = 144;
/** How far the header sits down the card, so the picture straddles the cover's edge. */
const HEADER_TOP = 60;

/**
 * Somebody else's profile, the full page — where the popup's "View full
 * profile" lands. One block, the Instagram layout the website uses:
 * their cover as a strip with the picture overlapping it, the three
 * numbers beside the picture, the name and handle under, Follow and
 * Share profile, and the whole shelf as a carousel-sized rail inside
 * the same block. Tapping a card opens the standard full view. The
 * server builds this from a type with no balance field, so this screen
 * could not leak one.
 */
export function PlayerProfileScreen() {
  const route = useRoute<RouteProp<StackParams, "PlayerProfile">>();
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const { playerId } = route.params;

  const [profile, setProfile] = useState<PeekProfile | null>(null);
  const [failed, setFailed] = useState(false);
  /* A guest sees Follow too; theirs starts sign-up, the website's
     Follow link for a visitor without an account. */
  const [guest, setGuest] = useState(false);

  useEffect(() => {
    let live = true;
    storedAccessToken()
      .then((token) => {
        if (live) setGuest(!token);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
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

        {/* The same header the owner sees, with Follow where they have
            Edit profile. Share is a link anybody can open. */}
        <View style={{ marginTop: HEADER_TOP }}>
          <ProfileHeader
            avatar={
              <PlayerAvatar
                displayName={profile.displayName}
                seed={profile.playerId}
                avatarUrl={profile.avatarUrl}
                frame={profile.frame}
                ring={profile.ring}
                aura={profile.aura}
                ringArt={profile.ringArt}
                auraArt={profile.auraArt}
                size={88}
              />
            }
            name={profile.displayName}
            handle={profile.handle}
            equips={profile.equips ?? {}}
            embersEarned={profile.embersEarned}
            stats={profile.stats}
            actions={
              <>
                {profile.follow ? (
                  <FollowButton playerId={profile.playerId} initial={profile.follow} fill />
                ) : guest ? (
                  <HeaderButton
                    label="Follow"
                    primary
                    onPress={() => navigation.navigate("CreateAccount")}
                  />
                ) : null}
                <ShareProfileButton playerId={profile.playerId} name={profile.displayName} />
              </>
            }
          />
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
                        border: profile.equips?.border ?? null,
                      })
                    }
                  >
                    <CosmeticCard
                      imageUrl={entry.imageUrl}
                      width={SHELF_TILE}
                      frame={entry.frame}
                      holo={entry.holo}
                      effect={profile.effect}
                      border={profile.equips?.border ?? null}
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
