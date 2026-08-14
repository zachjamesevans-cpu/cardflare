import { useRoute, type RouteProp } from "@react-navigation/native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import { peekPlayer, type PeekProfile } from "../api";
import { CosmeticCard } from "../cosmetic-card";
import { EmberBadge } from "../ember-badge";
import { PlayerAvatar } from "../player-avatar";
import { Body, Card, Muted, Title } from "../ui";
import { colors, spacing } from "../theme";

/**
 * Somebody else's profile, the full page — where the popup's "View full
 * profile" lands. The same public shape the website's /p page shows:
 * picture wearing their border, name, lifetime Embers, and the whole
 * shelf with each card in its own dressing. The server builds this from
 * a type with no balance field, so this screen could not leak one.
 */
export function PlayerProfileScreen() {
  const route = useRoute<RouteProp<StackParams, "PlayerProfile">>();
  const { playerId } = route.params;

  const [profile, setProfile] = useState<PeekProfile | null>(null);
  const [failed, setFailed] = useState(false);
  /* Cards render together once their art is warm, not one by one. */
  const [shelfReady, setShelfReady] = useState(false);

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
      <Card>
        <View style={{ alignItems: "center", gap: spacing(2) }}>
          <PlayerAvatar
            displayName={profile.displayName}
            seed={profile.playerId}
            avatarUrl={profile.avatarUrl}
            frame={profile.frame}
            size={96}
          />
          <Title>{profile.displayName}</Title>
          <EmberBadge earned={profile.embersEarned} size="md" />
          <Muted>Earned by confirming trades, and nothing else.</Muted>
        </View>
      </Card>

      <Card>
        <Title>Showcase</Title>
        <Body>
          Cards this player is proud of. Not a trade list, so there is nothing to
          pledge on here.
        </Body>

        {profile.showcase.length === 0 ? (
          <Muted>Nothing on the shelf yet.</Muted>
        ) : !shelfReady ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Muted>Loading showcase…</Muted>
          </View>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(3) }}>
            {profile.showcase.map((entry) => (
              <View key={entry.id} style={{ gap: spacing(1), width: 92 }}>
                <CosmeticCard
                  imageUrl={entry.imageUrl}
                  width={92}
                  frame={entry.frame}
                  holo={entry.holo}
                  effect={profile.effect}
                />
                <Text
                  numberOfLines={1}
                  style={{ color: colors.textSecondary, fontSize: 12 }}
                >
                  {entry.name}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>
    </ScrollView>
  );
}
