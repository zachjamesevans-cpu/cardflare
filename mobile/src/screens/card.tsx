import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { CartToast } from "../cart-toast";
import { addToCart, cartCount, inCart, useFlareCart } from "../flare-cart";
import { FlaredTag } from "../flared-mark";
import { artFlared, cardFlared, useMyFlares } from "../my-flares";
import { ArtCarousel } from "../art-carousel";
import { openComposer } from "../open-composer";
import { FLARE_BUTTON, FlareButton } from "../flare-button";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loadCardPrices } from "../price-cache";
import { CardPricesPanel } from "../card-prices";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, Text, useWindowDimensions, View, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

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
import { demandLine } from "../demand-copy";
import { cachedPlayerId, readCache, writeCache } from "../cache";
import { displayCardName } from "../card-name";
import { gameShortName } from "../games";
import { PlayerAvatar } from "../player-avatar";
import { colors, gutter, radius, spacing } from "../theme";
import {
  AsyncButton,
  Button,
  CardImage,
  ErrorLine,
  Loading,
  Muted,
  Tap,
  Title,
} from "../ui";

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
  /* Prices are asked for the moment the card is opened, beside the card
     itself, not after it has drawn (src/price-cache.ts). */
  useEffect(() => {
    void loadCardPrices(cardId);
  }, [cardId]);
  const navigation = useNavigation<NativeStackNavigationProp<StackParams>>();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [page, setPage] = useState<CardPage | null>(null);
  /* Which art the carousel shows; back to the first on another card. */
  const [artAt, setArtAt] = useState(0);
  useEffect(() => setArtAt(0), [cardId]);
  /* Re-render when your Flares arrive, for "On your Flares". */
  useMyFlares();
  /* The cart (flare-cart.ts), and what the + just added, for its toast. */
  useFlareCart();
  const [added, setAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  /* The card a fresh read has painted, so a slow disk read never
     paints an older page over it. */
  const freshFor = useRef<string | null>(null);

  /*
   * The page as last seen, painted at once: the screen opened on a
   * spinner every time, for art and a name that never change. Kept by
   * card under the signed-in player's id (the page says what YOU have
   * to do with it), so a guest has none and the next account on this
   * phone never reads it. The fresh read below lands over it.
   */
  useEffect(() => {
    let live = true;
    void (async () => {
      const viewer = await cachedPlayerId();
      if (!viewer) return;
      const cached = await readCache<CardPage>("card", viewer, cardId);
      if (live && cached?.card && freshFor.current !== cardId) {
        setPage((current) => current ?? cached);
      }
    })();
    return () => {
      live = false;
    };
  }, [cardId]);

  const load = useCallback(async () => {
    try {
      const { page: fresh } = await getCardPage(cardId);
      freshFor.current = cardId;
      setPage(fresh);
      setError(null);
      const viewer = await cachedPlayerId();
      if (viewer) void writeCache("card", viewer, fresh, cardId);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        /* Gone: the last look goes too, from the screen and the phone. */
        freshFor.current = cardId;
        setPage(null);
        setMissing(true);
        const viewer = await cachedPlayerId();
        if (viewer) void writeCache("card", viewer, null, cardId);
      } else setError(friendlyError(caught));
    }
  }, [cardId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!page) {
    return (
      <CardOverlay>
      <View
        style={{
          flex: 1,
          /* A sheet fitted to its contents starts at this, not a sliver. */
          minHeight: 420,
          backgroundColor: "transparent",
          paddingHorizontal: gutter,
          paddingVertical: spacing(4),
        }}
      >
        {missing ? (
          <Muted>No such card.</Muted>
        ) : error ? (
          <View style={{ gap: spacing(3) }}>
            <Muted>{`This card could not be opened. ${error}`}</Muted>
            <AsyncButton
              label="Try again"
              pendingLabel="Retrying…"
              onPress={() => load()}
            />
          </View>
        ) : (
          <Loading />
        )}
      </View>
      </CardOverlay>
    );
  }

  const { card, you, located, holders, hunters, stores } = page;
  const standing = demandLine(page.demand);
  /* The provider's name, without a bracketed number printed below it. */
  const name = displayCardName(card.name, card.number);
  /* Large, but never wider than a card reads comfortably. */
  const artWidth = Math.min(240, screenWidth - gutter * 2);
  /* The arts to swipe; an older server sends only the one. */
  const arts =
    card.arts && card.arts.length > 0
      ? card.arts
      : card.imageUrl
        ? [{ imageUrl: card.imageUrl, label: "", variants: [] }]
        : [];
  /* "On your Flares" for the art on show: the server's word for this
     card, else what the app already holds (my-flares.ts). */
  const shownPrintings = arts[artAt]?.printingIds ?? [];
  const wantedPrintings = page?.you?.wantedPrintings;
  /* The printing a + adds: the art on show's first; null without arts. */
  const shownPrinting = arts[artAt]?.printingIds?.[0] ?? null;
  const shownInCart = inCart(card.cardId, shownPrinting);
  const onYourFlares =
    wantedPrintings !== undefined
      ? wantedPrintings.some(
          (printing) =>
            printing === null ||
            shownPrintings.length === 0 ||
            shownPrintings.includes(printing),
        )
      : shownPrintings.length > 0
        ? artFlared(card.cardId, shownPrintings)
        : cardFlared(card.cardId);

  return (
    <CardOverlay>
    <ScrollView
      style={{ flex: 1, backgroundColor: "transparent" }}
      /* Pulled down past the top and let go: closed, like a photo. */
      onScrollEndDrag={(event) => {
        if (event.nativeEvent.contentOffset.y < -90) navigation.goBack();
      }}
      contentContainerStyle={{
        paddingHorizontal: gutter,
        paddingTop: insets.top + spacing(12),
        gap: spacing(4),
        /* The closing space below fills the screen's rest (flexGrow). */
        flexGrow: 1,
        paddingBottom: 0,
      }}
    >
      {/* The card: the art large and centred, tap to read it at full
          size like every other card in the app, then the name, the
          number and the game under it. */}
      <View style={{ alignItems: "center", gap: spacing(3) }}>
        {/* Every art of the card, swiped (art-carousel.tsx); the sheet's
            full width, past the gutter, so a page is one art. */}
        {arts.length === 0 ? (
          <CardImage imageUrl={null} width={artWidth} name={name} cardNumber={card.number} />
        ) : (
        <View style={{ marginHorizontal: -gutter }}>
          <ArtCarousel
            arts={arts}
            name={name}
            cardNumber={card.number}
            pageWidth={screenWidth}
            artWidth={artWidth}
            index={Math.min(artAt, Math.max(0, arts.length - 1))}
            onIndex={setArtAt}
          />
        </View>
        )}
        <View style={{ alignItems: "center", gap: spacing(1) }}>
          <Title>{name}</Title>
          {/* The art on show is on your Flares: a "Flared" tag on the
              number's own line, following the carousel. On that line, not
              one of its own, so swiping between arts never moves the
              prices below (the founder: "the height changes on the market
              price"). */}
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: spacing(2), minHeight: 20 }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              {`${card.number} · ${gameShortName(card.game)}`}
            </Text>
            {onYourFlares ? <FlaredTag small={false} /> : null}
          </View>
          {/* "12 hunting · 3 have it for trade": the two lists below,
              counted. What a price would say, without one. Same line
              on the website's card page. */}
          {standing ? (
            <Text
              style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "600" }}
            >
              {standing}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Market prices from Scrydex, loaded after the card: the
          website's panel, the same spot (src/card-prices.tsx). */}
      <CardPricesPanel
        cardId={card.cardId}
        variants={arts[artAt]?.variants}
        onPick={(variant) => {
          const at = arts.findIndex((art) => art.variants.includes(variant));
          if (at >= 0) setArtAt(at);
        }}
      />

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
        </View>
      ) : null}

      {/* Each list only when it has someone in it, led by how many: no
          line that only says "nobody". The founder: "i don't like all
          that text at the bottom". */}
      {holders.length > 0 ? (
      <Section heading={countHeading(holders.length, "player has it", "players have it", located ? "near you" : null)}>
        {(
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
      ) : null}

      {hunters.length > 0 ? (
      <Section heading={countHeading(hunters.length, "player hunting it", "players hunting it", null)}>
        {(
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
      ) : null}

      {stores.length > 0 ? (
      <Section heading={countHeading(stores.length, "store has it", "stores have it", located ? "nearby" : null)}>
        {(
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
      ) : null}
      {/* The empty space under the last section closes the card, the way
          a tap off a photo does: the founder, "you should be able to tap
          the bottom empty section to close it". It fills whatever room is
          left, and at least a thumb's height. */}
      <Pressable
        accessibilityLabel="Close"
        onPress={() => navigation.goBack()}
        style={{ flexGrow: 1, minHeight: spacing(24) }}
      />
    </ScrollView>
    {/* The Flare button, for THIS card: the composer, the card already
        in it (flare-button.tsx). It replaced "Post a Flare for it". */}
    {/*
     * The + puts the art on show in your Flare, like a cart, without
     * sliding the composer up: the founder, "when pressing the + button,
     * it just has ... similar function to how when you add something to
     * cart, it just tallies up, then you can view 'full cart'." Already
     * in it, the + is a ✓ and opens the Flare, pushed inside the sheet
     * so back returns to this card (open-composer.ts). Each art is its
     * own card ("all alternate arts need to be treated as separate").
     */}
    <FlareButton
      label={shownInCart ? `View your Flare, ${cartCount()} cards` : `Add ${name} to your Flare`}
      done={shownInCart}
      onPress={() => {
        if (shownInCart) {
          openComposer(navigation);
          return;
        }
        const art = arts[artAt];
        void addToCart({
          cardId: card.cardId,
          name: card.name,
          cardNumber: card.number,
          imageUrl: art?.imageUrl ?? card.imageUrl,
          printings: arts.flatMap((each) =>
            (each.printingIds ?? []).map((id) => ({
              id,
              label: each.label || null,
              imageUrl: each.imageUrl,
            })),
          ),
          printingId: shownPrinting,
          quantity: 1,
        }).then((outcome) => {
          if (outcome !== "added") return;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          setAdded(arts.length > 1 && art?.label ? `${card.name} · ${art.label}` : card.name);
        });
      }}
      style={{ right: gutter + spacing(1), bottom: insets.bottom + spacing(4) }}
    />
    <CartToast
      line={added}
      count={cartCount()}
      onView={() => {
        setAdded(null);
        openComposer(navigation);
      }}
      onGone={() => setAdded(null)}
      style={{
        left: gutter,
        right: gutter + spacing(1) + FLARE_BUTTON + spacing(3),
        bottom: insets.bottom + spacing(4) + 4,
      }}
    />
    </CardOverlay>
  );
}

/**
 * The card's sheet: iOS draws it (App.tsx presents this route as its own
 * modal sheet, the screen behind receding and dimmed, a swipe down to
 * close); this adds the grab handle that says it can be pulled down, and
 * a close button for anyone who would rather tap.
 */
function CardOverlay({ children }: { children: ReactNode }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  return (
    /* The screen behind, blurred and darkened: the Feed's card zoom
       (ui.tsx), the same blur and the same dark. No panel, no handle. */
    <View style={{ flex: 1 }}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.45)" }]} />
      <View
        style={{
          position: "absolute",
          top: insets.top + spacing(2),
          right: spacing(4),
          zIndex: 1,
        }}
      >
        <Tap
          onPress={() => navigation.goBack()}
          hitSlop={10}
          accessibilityLabel="Close"
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255,255,255,0.14)",
          }}
        >
          <Ionicons name="close" size={20} color={colors.textPrimary} />
        </Tap>
      </View>
      {children}
    </View>
  );
}

/** One true fact about you and this card, as a plain line. */
function Fact({ children }: { children: ReactNode }) {
  return <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{children}</Text>;
}

/** A heading, then its rows or its one honest empty line. */
/** "3 players have it near you", "1 player hunting it". */
function countHeading(
  count: number,
  one: string,
  many: string,
  where: string | null,
): string {
  return [String(count), count === 1 ? one : many, where].filter(Boolean).join(" ");
}

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
