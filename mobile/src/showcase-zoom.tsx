import { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ScrollViewProps,
} from "react-native";

import { RemoteImage } from "./remote-image";

import { CosmeticCard } from "./cosmetic-card";
import { LinearGradient } from "expo-linear-gradient";

import { colors, radius, spacing } from "./theme";

/** What the zoom shows: a showcase entry and the dressing it wears. */
export type ZoomedCard = {
  /** The entry, so a shelf can say which of its cards was tapped. */
  id?: string;
  /** The catalogue border worn on the owner's cards, when one is. */
  border?: string | null;
  name: string;
  number?: string;
  imageUrl: string | null;
  frame: string | null;
  holo: string | null;
  effect: string | null;
  /** The owner's caption, under the card. */
  note?: string | null;
};

/* The same pager geometry the Feed's card zoom uses (ui.tsx), so the
   showcase swipes exactly the way a Flare rail does: the neighbours
   peek at both edges and momentum lands on a card. */
const PEEK_WIDTH = 26;
const PEEK_GAP = 8;
const IMMEDIATE_TOUCHES = {
  delaysContentTouches: false,
} as unknown as ScrollViewProps;

/**
 * A showcase card, full screen — the same tap-to-open, tap-anywhere-
 * to-close contract as every other card viewer in the product. The
 * card keeps its dressing at size: foil, frame and effect all render
 * through the same CosmeticCard the thumbnail used, so what zooms is
 * exactly what was tapped.
 *
 * With the whole shelf handed over it is a pager: the founder's ask,
 * "swipe horizontally through showcase cards the same way Flare cards
 * can be swiped in the main feed". The name and the note follow the
 * card that landed.
 */
export function ShowcaseZoom({
  card,
  cards,
  onClose,
}: {
  /** Null when closed. */
  card: ZoomedCard | null;
  /** The rest of the shelf, for paging. One card is no shelf. */
  cards?: ZoomedCard[];
  onClose: () => void;
}) {
  const window = useWindowDimensions();
  const large = Math.min(window.width - spacing(12), 340);

  const shelf = cards && cards.length > 1 ? cards : null;
  const opened = shelf && card ? Math.max(0, shelf.findIndex((c) => c.id === card.id)) : 0;
  const [at, setAt] = useState(opened);
  useEffect(() => {
    if (card) setAt(opened);
  }, [card, opened]);

  /* Did this gesture scroll the rail? A press that arrives with this
     still false was a tap, and a tap on the card closes. */
  const scrolled = useRef(false);

  const shown = shelf ? (shelf[at] ?? shelf[0]) : card;
  const hero = shelf ? large - 2 * (PEEK_WIDTH + PEEK_GAP) : large;
  const page = hero + PEEK_GAP;
  const sidePad = (large - hero) / 2;
  const cardHeight = Math.round((hero * 84) / 60);

  return (
    <Modal
      visible={card !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)" }}>
        {/* The closer sits behind rather than wrapping: a Pressable
            around the rail would claim the pan and the cards would not
            move. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          pointerEvents="box-none"
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: spacing(3),
            padding: spacing(4),
          }}
        >
          {shown && (
            <>
              {shelf ? (
                <View style={{ width: large, height: cardHeight }}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    {...IMMEDIATE_TOUCHES}
                    onScrollBeginDrag={() => {
                      scrolled.current = true;
                    }}
                    onScrollEndDrag={() => {
                      setTimeout(() => {
                        scrolled.current = false;
                      }, 80);
                    }}
                    snapToInterval={page}
                    snapToAlignment="start"
                    decelerationRate="fast"
                    disableIntervalMomentum
                    contentOffset={{ x: opened * page, y: 0 }}
                    style={{ flex: 1 }}
                    contentContainerStyle={{
                      paddingHorizontal: sidePad,
                      gap: PEEK_GAP,
                      alignItems: "center",
                    }}
                    onMomentumScrollEnd={(event) => {
                      const landed = Math.round(event.nativeEvent.contentOffset.x / page);
                      if (landed >= 0 && landed < shelf.length) setAt(landed);
                      scrolled.current = false;
                    }}
                  >
                    {shelf.map((entry, index) => (
                      <Pressable
                        key={entry.id ?? index}
                        onPress={() => {
                          if (scrolled.current) return;
                          onClose();
                        }}
                      >
                        <CosmeticCard
                          imageUrl={entry.imageUrl}
                          width={hero}
                          frame={entry.frame}
                          holo={entry.holo}
                          effect={entry.effect}
                          border={entry.border ?? null}
                        />
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : (
                <Pressable onPress={onClose}>
                  <CosmeticCard
                    imageUrl={shown.imageUrl}
                    width={hero}
                    frame={shown.frame}
                    holo={shown.holo}
                    effect={shown.effect}
                    border={shown.border ?? null}
                  />
                </Pressable>
              )}
              <Pressable onPress={onClose} style={{ alignItems: "center", gap: spacing(1) }}>
                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "600" }}>
                  {shown.name}
                </Text>
                {shown.number ? (
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{shown.number}</Text>
                ) : null}
                {/* The note travels with the card: the tile has no room
                    for it, so under the big card is where it gets read. */}
                {shown.note ? (
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: 14,
                      fontStyle: "italic",
                      textAlign: "center",
                      maxWidth: large,
                      paddingHorizontal: spacing(2),
                      paddingTop: spacing(1),
                      borderRadius: radius.control,
                    }}
                  >
                    {shown.note}
                  </Text>
                ) : null}
                <Text style={{ color: colors.textMuted, fontSize: 12, paddingTop: spacing(1) }}>
                  Tap anywhere to close
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

/**
 * The cover banner a profile block wears, or the quiet default. Shared
 * by the full profile and the popup so "has no cover yet" looks the
 * same everywhere: the plain elevated block, never a broken image.
 */
export function CoverBanner({
  coverUrl,
  height,
  blur = 0,
  fade = false,
}: {
  coverUrl: string | null;
  height: number;
  blur?: number;
  /**
   * Dissolve into the card instead of stopping at an edge.
   *
   * The founder's redesign, with a mockup: the art carries down past
   * the name and the badge and fades out, rather than ending at a hard
   * seam across the picture's middle. The web does this with a
   * gradient over the lower two thirds; this is the same shape in
   * Skia-free React Native, so the two platforms match.
   */
  fade?: boolean;
}) {
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        overflow: "hidden",
        backgroundColor: colors.elevated,
      }}
      pointerEvents="none"
    >
      {coverUrl ? (
        <RemoteImage
          uri={coverUrl}
          blurRadius={blur}
          style={{ width: "100%", height: "100%" }}
          /* Top-anchored, so a face or a logo in the upper half of
             somebody's banner survives the crop. */
          contentPosition="top"
        />
      ) : null}
      {/* A quiet darkening so light covers never wash out the text. */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.25)",
        }}
      />
      {fade ? (
        /*
         * Ends on the card's own colour, not on transparent: a fade
         * that finishes anywhere else stops in a visible band instead
         * of dissolving.
         */
        <LinearGradient
          colors={["transparent", `${colors.surface}CC`, colors.surface]}
          locations={[0, 0.55, 1]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: Math.round(height * 0.66),
          }}
        />
      ) : null}
    </View>
  );
}
