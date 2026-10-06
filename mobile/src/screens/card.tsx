import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState, type ReactNode } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";

import type { StackParams } from "../../App";
import {
  ApiError,
  friendlyError,
  getCardPage,
  openDirectThread,
  serverMessage,
  type CardPage,
  type CardPagePlayer,
} from "../api";
import { displayCardName } from "../card-name";
import { gameShortName } from "../games";
import { PlayerAvatar } from "../player-avatar";
import { colors, gutter, radius, spacing } from "../theme";
import { Button, CardImage, ErrorLine, Loading, Muted, Tap, Title } from "../ui";

/**
 * One card, whole: the website's /cards/[cardId], reached from a
 * search result.
 *
 * Top to bottom, the same on both platforms: the card itself, what
 * you have to do with it, who has it near you, who is hunting it, and
 * which stores have it in the case. Every row comes from the page
 * object the server built; nothing on this screen is made up, and an
 * empty section says so in words rather than drawing a placeholder.
 */

/** "About 3 mi": a store's distance, whole miles. */
export function aboutMiles(miles: number): string {
  return `About ${Math.max(1, Math.round(miles))} mi`;
}

export function CardScreen({ cardId }: { cardId: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const { width: screenWidth } = useWindowDimensions();
  const [page, setPage] = useState<CardPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { page: fresh } = await getCardPage(cardId);
      setPage(fresh);
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) setMissing(true);
      else setError(friendlyError(caught));
    }
  }, [cardId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!page) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.canvas,
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
        }}
      >
        {missing ? (
          <Muted>No such card.</Muted>
        ) : error ? (
          <Muted>{`This card could not be opened. ${error}`}</Muted>
        ) : (
          <Loading />
        )}
      </View>
    );
  }

  const { card, you, located, holders, hunters, stores } = page;
  /* The provider's name, without a bracketed number printed below it. */
  const name = displayCardName(card.name, card.number);
  /* Large, but never wider than a card reads comfortably. */
  const artWidth = Math.min(240, screenWidth - gutter * 2);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{
        paddingHorizontal: gutter,
        paddingVertical: spacing(4),
        gap: spacing(4),
      }}
    >
      {/* The card: the art large and centred, tap to read it at full
          size like every other card in the app, then the name, the
          number and the game under it. */}
      <View style={{ alignItems: "center", gap: spacing(3) }}>
        <CardImage
          imageUrl={card.imageUrl}
          width={artWidth}
          name={name}
          cardNumber={card.number}
        />
        <View style={{ alignItems: "center", gap: spacing(1) }}>
          <Title>{name}</Title>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            {`${card.number} · ${gameShortName(card.game)}`}
          </Text>
        </View>
      </View>

      {/* You: one line per true fact, then the one control. Nothing of
          this when signed out; the server sends `you` as null. */}
      {you ? (
        <View style={{ gap: spacing(2) }}>
          {you.inTradeBinder ? <Fact>In your trade binder</Fact> : null}
          {you.onHunt ? (
            <Tap
              onPress={() =>
                navigation.navigate("Hunt", { huntId: you.onHunt?.huntId ?? "" })
              }
              accessibilityLabel={`Open hunt ${you.onHunt.name}`}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 14 }}>
                {"On your hunt: "}
                <Text style={{ color: colors.accent, fontWeight: "700" }}>
                  {you.onHunt.name}
                </Text>
              </Text>
            </Tap>
          ) : null}
          {you.wanted ? <Fact>You want this</Fact> : null}
          <Button
            label="Post a Flare for it"
            /* The card goes with it, as the draft's first line: the
               founder, "Should autofill as the first flare." */
            onPress={() =>
              navigation.navigate("Tabs", {
                screen: "Flare",
                params: {
                  card: {
                    cardId: card.cardId,
                    name: card.name,
                    cardNumber: card.number,
                    imageUrl: card.imageUrl,
                  },
                },
              })
            }
          />
        </View>
      ) : null}

      <Section heading={located ? "Who has it near you" : "Who has it"}>
        {holders.length === 0 ? (
          <Muted>Nobody with it in a binder up for trade yet.</Muted>
        ) : (
          holders.map((holder, index) => (
            <HolderRow
              key={holder.player.playerId}
              first={index === 0}
              player={holder.player}
              milesLabel={holder.milesLabel}
            />
          ))
        )}
      </Section>

      <Section heading="Who is hunting it">
        {hunters.length === 0 ? (
          <Muted>Nobody is hunting it yet.</Muted>
        ) : (
          hunters.map((hunter, index) => (
            <Row
              key={`${hunter.player.playerId}-${hunter.postId ?? hunter.huntId ?? index}`}
              first={index === 0}
              label={`Open ${hunter.player.displayName}'s ${hunter.postId ? "Flare" : "hunt"}`}
              onPress={
                hunter.postId
                  ? () =>
                      navigation.navigate("FlarePost", { postId: hunter.postId ?? "" })
                  : hunter.huntId
                    ? () => navigation.navigate("Hunt", { huntId: hunter.huntId ?? "" })
                    : undefined
              }
            >
              <PlayerAvatar
                displayName={hunter.player.displayName}
                seed={hunter.player.playerId}
                avatarUrl={hunter.player.avatarUrl}
                frame={hunter.player.frame}
                ring={hunter.player.ring}
                size={32}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Name name={hunter.player.displayName} milesLabel={hunter.milesLabel} />
                <Text
                  numberOfLines={1}
                  style={{ color: colors.textMuted, fontSize: 12 }}
                >
                  {`Wants ${hunter.quantity}`}
                  {hunter.printingLabel ? ` · ${hunter.printingLabel}` : ""}
                </Text>
              </View>
            </Row>
          ))
        )}
      </Section>

      <Section heading={located ? "In the case nearby" : "In the case"}>
        {stores.length === 0 ? (
          <Muted>No store near you has it listed.</Muted>
        ) : (
          stores.map((store, index) => (
            <Row
              key={store.storeId}
              first={index === 0}
              label={`Open ${store.name}`}
              onPress={() =>
                navigation.navigate("StoreProfile", { storeId: store.storeId })
              }
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{ color: colors.textPrimary, fontWeight: "600" }}
                >
                  {store.name}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ color: colors.textMuted, fontSize: 12 }}
                >
                  {[store.city, store.miles !== null ? aboutMiles(store.miles) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              <Chip label={store.inCase ? "In the case" : "Counter has it"} />
            </Row>
          ))
        )}
      </Section>
    </ScrollView>
  );
}

/** One true fact about you and this card, as a plain line. */
function Fact({ children }: { children: ReactNode }) {
  return <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{children}</Text>;
}

/** A heading, then its rows or its one honest empty line. */
function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing(2) }}>
      <Title>{heading}</Title>
      <View>{children}</View>
    </View>
  );
}

/** The name, with the distance after it when the viewer is located. */
function Name({ name, milesLabel }: { name: string; milesLabel: string | null }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1.5) }}>
      <Text
        numberOfLines={1}
        style={{ color: colors.textPrimary, fontWeight: "600", flexShrink: 1 }}
      >
        {name}
      </Text>
      {milesLabel ? (
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{milesLabel}</Text>
      ) : null}
    </View>
  );
}

/**
 * Somebody with the card in a binder up for trade: the face and name
 * open their profile, and the Message button opens the conversation
 * the profile's own Message button opens, so there is one way to
 * reach a person and not two that can disagree.
 */
function HolderRow({
  first,
  player,
  milesLabel,
}: {
  first: boolean;
  player: CardPagePlayer;
  milesLabel: string | null;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const [messaging, setMessaging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const message = async () => {
    if (messaging) return;
    setMessaging(true);
    setError(null);
    try {
      const result = await openDirectThread(player.playerId);
      if (result.ok && result.threadId) {
        navigation.navigate("LocalThread", { threadId: result.threadId });
        return;
      }
      setError(result.message ?? "Could not start the conversation.");
    } catch (caught) {
      setError(serverMessage(caught) ?? "Could not start the conversation.");
    } finally {
      setMessaging(false);
    }
  };

  return (
    <View
      style={{
        gap: spacing(1),
        paddingVertical: spacing(2.5),
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Tap
            onPress={() =>
              navigation.navigate("PlayerProfile", { playerId: player.playerId })
            }
            accessibilityLabel={`Open ${player.displayName}'s profile`}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing(3) }}
          >
            <PlayerAvatar
              displayName={player.displayName}
              seed={player.playerId}
              avatarUrl={player.avatarUrl}
              frame={player.frame}
              ring={player.ring}
              size={32}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Name name={player.displayName} milesLabel={milesLabel} />
            </View>
          </Tap>
        </View>
        <Button
          label="Message"
          variant="secondary"
          busy={messaging}
          onPress={() => void message()}
        />
      </View>
      <ErrorLine message={error} />
    </View>
  );
}

/** A result row: a tap, a hairline above every row but the first. */
function Row({
  first,
  label,
  onPress,
  children,
}: {
  first: boolean;
  label: string;
  onPress?: () => void;
  children: ReactNode;
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(3),
        paddingVertical: spacing(2.5),
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      {children}
    </Tap>
  );
}

/** "In the case" or "Counter has it", small, at a store row's end. */
function Chip({ label }: { label: string }) {
  return (
    <View
      style={{
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.elevated,
        paddingHorizontal: spacing(2),
        paddingVertical: 2,
      }}
    >
      <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "700" }}>
        {label}
      </Text>
    </View>
  );
}
