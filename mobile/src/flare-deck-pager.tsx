import { Ionicons } from "@expo/vector-icons";
import { useRef, useState, type ReactNode } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";

import type { FeedCard } from "./api";
import { haveFor, type PostRef } from "./post-social";
import { RemoteImage } from "./remote-image";
import { colors, radius, spacing } from "./theme";
import { CardImage, Tap, type ZoomCard } from "./ui";

/**
 * A deck on the Feed: the founder's second concept render.
 *
 * An inset panel holds a pager with the hero card centred and its
 * neighbours peeking either side, the active card's name and number
 * beside it, dots under the hero, a "1/4" pill in the corner, a swipe
 * hint, and a strip of thumbnails that jump the pager. Every card is
 * the same CardImage the rest of the Feed draws, so a tap still opens
 * the zoom with "I have this" inside it.
 */

const GAP = 10;

export function FlareDeckPager({
  cards,
  total,
  post,
  chips,
  note,
}: {
  cards: FeedCard[];
  /** How many they posted, which can exceed what is shown. */
  total: number;
  post: PostRef;
  /** Want / Trade / Cash ok, drawn beside the active card. */
  chips: ReactNode;
  note: string | null;
}) {
  const window = useWindowDimensions();
  const [at, setAt] = useState(0);
  const scroller = useRef<ScrollView>(null);

  /* Screen gutters, the post's padding, and the panel's own. */
  const panelWidth = window.width - spacing(8) - spacing(8) - spacing(6);
  const pagerWidth = Math.round(panelWidth * 0.56);
  const hero = Math.round(Math.min(150, Math.max(110, pagerWidth * 0.64)));
  const page = hero + GAP;
  const sidePad = Math.max(0, (pagerWidth - hero) / 2);

  const shelf: ZoomCard[] = cards.map((card) => ({
    imageUrl: card.imageUrl,
    name: card.cardName,
    cardNumber: card.cardNumber,
    youHave: card.match ? { kind: card.match, count: 0 } : null,
    have: haveFor(card, post),
  }));

  const active = cards[at] ?? cards[0];
  const jump = (index: number) => {
    setAt(index);
    scroller.current?.scrollTo({ x: index * page, animated: true });
  };

  return (
    <View
      style={{
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: "rgba(0,0,0,0.35)",
        padding: spacing(3),
        gap: spacing(3),
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing(2) }}>
        <View style={{ width: pagerWidth, gap: spacing(2) }}>
          <ScrollView
            ref={scroller}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={page}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum
            contentContainerStyle={{
              paddingHorizontal: sidePad,
              gap: GAP,
              alignItems: "center",
              paddingVertical: spacing(2),
            }}
            onMomentumScrollEnd={(event) => {
              const landed = Math.round(event.nativeEvent.contentOffset.x / page);
              if (landed >= 0 && landed < cards.length) setAt(landed);
            }}
          >
            {cards.map((card, index) => (
              <View
                key={card.cardId}
                style={{
                  opacity: index === at ? 1 : 0.45,
                  transform: [{ scale: index === at ? 1 : 0.92 }],
                  shadowColor: colors.accent,
                  shadowOpacity: index === at ? 0.5 : 0,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 0 },
                }}
              >
                <CardImage
                  imageUrl={card.imageUrl}
                  width={hero}
                  name={card.cardName}
                  cardNumber={card.cardNumber}
                  youHave={card.match ? { kind: card.match, count: 0 } : undefined}
                  state={card.state}
                  have={haveFor(card, post)}
                  siblings={shelf}
                  position={index}
                />
              </View>
            ))}
          </ScrollView>
          {/* One dot per card, the active one in the accent. */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              gap: spacing(2),
            }}
          >
            {cards.map((card, index) => (
              <View
                key={card.cardId}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: index === at ? colors.accent : colors.borderStrong,
                }}
              />
            ))}
          </View>
        </View>

        <View style={{ flex: 1, minWidth: 0, gap: spacing(2), paddingTop: spacing(1) }}>
          {/* "1/4", the corner pill. */}
          <View
            style={{
              alignSelf: "flex-end",
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              backgroundColor: colors.surface,
              paddingHorizontal: spacing(2.5),
              paddingVertical: 3,
            }}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: "700" }}>
              {`${at + 1}/${cards.length}`}
            </Text>
          </View>
          {active ? (
            <View style={{ gap: 2 }}>
              <Text
                numberOfLines={2}
                style={{ color: colors.textPrimary, fontSize: 17, fontWeight: "800" }}
              >
                {active.cardName}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                {active.cardNumber}
              </Text>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(1.5) }}>
            {chips}
          </View>
          {active?.match ? (
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}>
              {active.match === "exact" ? "You have this" : "You have another printing"}
            </Text>
          ) : null}
          {active?.state === "found" ? (
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}>
              Found
            </Text>
          ) : active?.youOffered ? (
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
              You said you have this
            </Text>
          ) : active?.state === "offered" ? (
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
              Somebody offered
            </Text>
          ) : null}
          {note ? (
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
              {`“${note}”`}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: colors.border }} />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: spacing(1.5),
        }}
      >
        <Ionicons name="swap-horizontal-outline" size={15} color={colors.textMuted} />
        <Text style={{ color: colors.textMuted, fontSize: 12, fontStyle: "italic" }}>
          {`Swipe to browse all ${total} cards`}
        </Text>
      </View>

      {/* The strip: every card small, the active one lit. Tap to jump. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing(2), paddingVertical: 2 }}
      >
        {cards.map((card, index) => (
          <Tap
            key={card.cardId}
            onPress={() => jump(index)}
            accessibilityLabel={`Show ${card.cardName}`}
            style={{
              width: 60,
              height: 84,
              borderRadius: 8,
              borderWidth: index === at ? 2 : 1,
              borderColor: index === at ? colors.accent : colors.border,
              backgroundColor: colors.elevated,
              overflow: "hidden",
              opacity: index === at ? 1 : 0.8,
              shadowColor: colors.accent,
              shadowOpacity: index === at ? 0.5 : 0,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 0 },
            }}
          >
            {card.imageUrl ? (
              <RemoteImage uri={card.imageUrl} style={{ width: "100%", height: "100%" }} />
            ) : null}
          </Tap>
        ))}
      </ScrollView>
    </View>
  );
}
