import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { toTab } from "../to-tab";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { Image, RefreshControl, ScrollView, Text, View } from "react-native";

import type { StackParams } from "../../App";
import { getGameHub, type GameHub, type HubCard } from "../api";
import { GAME_LOGO } from "../game-logos";
import { gameShortName, type GameSlug } from "../games";
import { RemoteImage } from "../remote-image";
import { colors, gutter, spacing } from "../theme";
import { Button, Tap } from "../ui";

const TILE = 112;

/**
 * A game's hub: its logo, then Most hunted, Price moves this week and Most
 * searched, each a row of cards that opens the card's sheet. The founder
 * (2026-11-25): "like a 'top 10 most searched cards' for each TCG", then
 * "build it all out". The server works the lists out (game-hub.ts) and
 * holds them an hour. A list with nothing in it is not drawn. "Search
 * Lorcana" goes back to Search with the game chosen. The website's
 * /games/[game] is the same.
 */
export function GameHubScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const { game } = useRoute<RouteProp<StackParams, "GameHub">>().params;
  const name = gameShortName(game);
  const [hub, setHub] = useState<GameHub | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { hub: next } = await getGameHub(game);
      setHub(next);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [game]);

  useEffect(() => {
    void load();
  }, [load]);

  const sections = hub
    ? [
        { title: "Most hunted", cards: hub.hunted },
        { title: "Price moves this week", cards: hub.movers },
        { title: "Most searched", cards: hub.searched },
      ].filter((section) => section.cards.length > 0)
    : [];
  const logo = GAME_LOGO[game as GameSlug];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ paddingVertical: spacing(5), gap: spacing(6) }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.accent}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <View style={{ alignItems: "center", gap: spacing(4), paddingHorizontal: gutter }}>
        {logo ? (
          <Image
            source={logo}
            resizeMode="contain"
            style={{ width: 220, height: 96 }}
            accessibilityLabel={name}
          />
        ) : (
          <Text style={{ color: colors.accent, fontSize: 28, fontWeight: "800" }}>{name}</Text>
        )}
        <Button
          label={`Search ${name}`}
          onPress={() =>
            toTab(navigation, "Search", { game, at: Date.now() })
          }
        />
      </View>

      {hub === null ? (
        failed ? (
          <Text style={{ color: colors.textMuted, textAlign: "center", paddingHorizontal: gutter }}>
            Could not load this right now. Pull down to try again.
          </Text>
        ) : (
          <HubSkeleton />
        )
      ) : sections.length === 0 ? (
        <Text
          style={{
            color: colors.textMuted,
            textAlign: "center",
            paddingHorizontal: gutter,
            lineHeight: 20,
          }}
        >
          {`Nothing to rank yet. As players hunt and look up ${name} cards, the most hunted and most searched show up here.`}
        </Text>
      ) : (
        sections.map((section) => (
          <View key={section.title} style={{ gap: spacing(3) }}>
            <Text
              accessibilityRole="header"
              style={{
                color: colors.textPrimary,
                fontSize: 19,
                fontWeight: "800",
                paddingHorizontal: gutter,
              }}
            >
              {section.title}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: gutter, gap: spacing(3) }}
            >
              {section.cards.map((card, index) => (
                <HubTile
                  key={card.cardId}
                  card={card}
                  rank={index + 1}
                  onPress={() => navigation.navigate("Card", { cardId: card.cardId })}
                />
              ))}
            </ScrollView>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function HubTile({ card, rank, onPress }: { card: HubCard; rank: number; onPress: () => void }) {
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={`${rank}. ${card.name}, ${card.stat}`}
      style={{ width: TILE, gap: spacing(1) }}
    >
      <View
        style={{
          width: TILE,
          height: Math.round((TILE * 88) / 63),
          borderRadius: 8,
          overflow: "hidden",
          backgroundColor: colors.elevated,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        {card.imageUrl ? (
          <RemoteImage uri={card.imageUrl} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        ) : null}
        <View
          style={{
            position: "absolute",
            top: 5,
            left: 5,
            paddingHorizontal: 6,
            height: 20,
            borderRadius: 6,
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.78)",
          }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 11, fontWeight: "800" }}>{rank}</Text>
        </View>
      </View>
      <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>
        {card.name}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          color:
            card.up === true ? colors.accent : card.up === false ? colors.danger : colors.textMuted,
          fontSize: 12,
          fontWeight: "700",
        }}
      >
        {card.stat}
      </Text>
    </Tap>
  );
}

/** While the hub loads: two rows of card shapes, so nothing jumps. */
function HubSkeleton() {
  return (
    <View style={{ gap: spacing(6) }}>
      {[0, 1].map((row) => (
        <View key={row} style={{ gap: spacing(3), paddingHorizontal: gutter }}>
          <View style={{ width: 140, height: 18, borderRadius: 6, backgroundColor: colors.elevated }} />
          <View style={{ flexDirection: "row", gap: spacing(3) }}>
            {[0, 1, 2].map((tile) => (
              <View
                key={tile}
                style={{
                  width: TILE,
                  height: Math.round((TILE * 88) / 63),
                  borderRadius: 8,
                  backgroundColor: colors.elevated,
                }}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
