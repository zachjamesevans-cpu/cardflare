import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { StackParams } from "../../App";
import {
  ApiError,
  getNightPlayer,
  type NightPlayerFlare,
  type NightPlayerView,
} from "../api";
import { BinderList } from "../binder-list";
import { MessageButton, ThumbRow } from "../mutual-match";
import {
  ACTIVE_FLARES,
  THEY_HAVE,
  THEY_WANT,
  TRADE_BINDERS,
  flaresLine,
  matchesWithYouLine,
  tradeCardsLine,
} from "../night-copy";
import { NightSection } from "../night-section";
import { PlayerAvatar } from "../player-avatar";
import { colors, gutter, spacing } from "../theme";
import {
  Body,
  Card,
  CardImage,
  Loading,
  Muted,
  Tap,
  Title,
  type ZoomCard,
} from "../ui";
import { useNightByCode } from "./night-matches";

/**
 * A player as this night sees them: the website's
 * /e/[code]/p/[playerId].
 *
 * The founder (2026-10-03): "Prioritize trade information: Profile
 * info; Matches with you; Their Flares at this Night; Public Trade
 * Binder; Message button." So the face and the name, "{n} matches
 * with you", They have and They want as thumbnails, Message, then
 * Active Flares (their tiles at this night) and Trade binders (the
 * Binders list's rows, up-for-trade ones only: the server never hands
 * over a private binder, and this screen never asks for one). View
 * full profile is the way to everything else about them.
 */
export function NightPlayerScreen({
  code,
  playerId,
}: {
  code: string;
  playerId: string;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const insets = useSafeAreaInsets();
  const { night, missing, failed } = useNightByCode(code);
  const [view, setView] = useState<NightPlayerView | null>(null);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!night) return;
    let live = true;
    void (async () => {
      try {
        const fresh = await getNightPlayer(night.eventId, playerId);
        if (live) setView(fresh);
      } catch (caught) {
        if (!live) return;
        if (caught instanceof ApiError && caught.status === 404) setGone(true);
        else
          setError("Could not load this player. Check your connection and try again.");
      }
    })();
    return () => {
      live = false;
    };
  }, [night, playerId]);

  if (missing || failed || gone || error) {
    return (
      <View style={{ paddingHorizontal: gutter, paddingVertical: spacing(4) }}>
        <Card>
          <Title>
            {gone
              ? "Not on this night's roster"
              : missing
                ? "No night on that code"
                : "Could not reach the night"}
          </Title>
          <Body>
            {gone
              ? "They are not going to this night any more, so there is nothing to match."
              : (error ?? "Check your connection and try again.")}
          </Body>
        </Card>
      </View>
    );
  }

  if (!night || !view) return <Loading />;

  const { player } = view;
  const shelf: ZoomCard[] = view.flares.map((f) => ({
    imageUrl: f.imageUrl,
    name: f.cardName,
    cardNumber: f.cardNumber,
    caption: f.printingLabel,
    note: f.note,
    lookingFor: f.quantity,
    direction: f.intent,
  }));

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: gutter,
        paddingVertical: spacing(4),
        paddingBottom: spacing(6) + insets.bottom,
        gap: spacing(4),
      }}
    >
      {/* The person: face, name, and why they matter here. */}
      <View style={{ gap: spacing(3) }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}>
          <PlayerAvatar
            displayName={player.displayName}
            seed={player.playerId}
            avatarUrl={player.avatarUrl}
            frame={player.frame}
            ring={player.ring}
            aura={player.aura}
            size={64}
          />
          <View style={{ flex: 1, gap: spacing(1) }}>
            <Text
              style={{ color: colors.textPrimary, fontSize: 22, fontWeight: "800" }}
            >
              {player.displayName}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>{night.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              {`${flaresLine(view.flaresCount)} · ${tradeCardsLine(view.tradeCards)}`}
            </Text>
          </View>
        </View>

        {view.matches > 0 ? (
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}
          >
            <Ionicons name="flame" size={18} color={colors.accent} />
            <Text style={{ color: colors.accent, fontSize: 17, fontWeight: "800" }}>
              {matchesWithYouLine(view.matches)}
            </Text>
          </View>
        ) : null}

        {view.theyHave.length > 0 ? (
          <ThumbRow label={THEY_HAVE} cards={view.theyHave} width={56} />
        ) : null}
        {view.theyWant.length > 0 ? (
          <ThumbRow label={THEY_WANT} cards={view.theyWant} width={56} />
        ) : null}

        <MessageButton
          playerId={player.playerId}
          label={`Message ${player.displayName}`}
        />
        <Tap
          onPress={() => navigation.navigate("PlayerProfile", { playerId })}
          hitSlop={6}
          accessibilityLabel="View full profile"
          style={{ alignSelf: "center" }}
        >
          <Text
            style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "600" }}
          >
            View full profile
          </Text>
        </Tap>
      </View>

      <NightSection label={ACTIVE_FLARES}>
        {view.flares.length === 0 ? (
          <Muted>Nothing on the board from them yet.</Muted>
        ) : (
          <FlareTiles flares={view.flares} shelf={shelf} />
        )}
      </NightSection>

      <NightSection label={TRADE_BINDERS} last>
        {view.binders.length === 0 ? (
          <Muted>No binders up for trade.</Muted>
        ) : (
          <BinderList
            binders={view.binders}
            yours={false}
            onOpen={(binderId) => navigation.navigate("Binder", { playerId, binderId })}
          />
        )}
      </NightSection>
    </ScrollView>
  );
}

/** Their Flares at this night: the board's tiles, to read. */
function FlareTiles({
  flares,
  shelf,
}: {
  flares: NightPlayerFlare[];
  shelf: ZoomCard[];
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing(2), paddingVertical: 2 }}
    >
      {flares.map((f, position) => (
        <View key={f.id} style={{ width: 72, gap: spacing(1) }}>
          <CardImage
            imageUrl={f.imageUrl}
            width={72}
            name={f.cardName}
            cardNumber={f.cardNumber}
            caption={f.printingLabel}
            note={f.note}
            lookingFor={f.quantity}
            direction={f.intent}
            siblings={shelf}
            position={position}
          />
          <Text
            numberOfLines={1}
            style={{ color: colors.textPrimary, fontSize: 11, fontWeight: "700" }}
          >
            {f.cardName}
          </Text>
          {/* Only an offer is labelled: a want is what a Flare is. */}
          {f.intent === "showcase" ? (
            <Text style={{ color: colors.textMuted, fontSize: 10 }}>Offering</Text>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}
