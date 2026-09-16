import { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import type { FeedCard } from "./api";
import {
  availableLabel,
  cardsLabel,
  copiesLabel,
  needLabel,
  printingLabel,
} from "./flare-copy";
import { haveFor, type PostRef } from "./post-social";
import { colors, radius, spacing } from "./theme";
import { CardImage, Tap, type ZoomCard } from "./ui";

/**
 * A multi-card Flare on the Feed: compact slides, one card each.
 *
 * The first pager was the founder's concept render, a hero card with
 * its neighbours peeking and a strip of thumbnails under it. It stood
 * taller than the post around it and said nothing about copies, which
 * are the whole point now that a Flare can ask for two of something.
 *
 * So each slide is the single-card row: the art beside its name, the
 * printing asked for and "Need 2 more", and the next slide peeks in
 * from the right so the swipe is discoverable. Dots and a counter say
 * where you are; a line underneath says what the whole post still
 * needs, and "View all" opens the list.
 *
 * Every card is the same CardImage the rest of the Feed draws, so a
 * tap still opens the zoom with "I have this" inside it.
 */

const GAP = spacing(2);
/** How much of the next slide shows, so a swipe is discoverable. */
const PEEK = 28;

/** Copies wanted or on offer for one card, whichever field arrived. */
export const copiesOf = (card: FeedCard): number => Math.max(1, card.quantity ?? 1);

/** Copies still wanted for one card. */
export const remainingOf = (card: FeedCard): number =>
  Math.max(0, card.remaining ?? (card.state === "found" ? 0 : copiesOf(card)));

/** Copies still wanted, or on offer, across every card shown. */
export function remainingAcross(
  cards: FeedCard[],
  direction: "want" | "showcase",
  given?: number,
): number {
  if (typeof given === "number") return given;
  return cards.reduce(
    (sum, card) =>
      sum + (direction === "showcase" ? copiesOf(card) : remainingOf(card)),
    0,
  );
}

/** The shelf the zoom pages along, built from the cards it draws. */
export function shelfFor(cards: FeedCard[], post: PostRef | undefined): ZoomCard[] {
  return cards.map((card) => ({
    imageUrl: card.imageUrl,
    name: card.cardName,
    cardNumber: card.cardNumber,
    caption: card.printingLabel ?? null,
    youHave: card.match ? { kind: card.match, count: 0 } : null,
    have: haveFor(card, post),
  }));
}

/**
 * One card, as a row: the art, then what is asked. The single-card
 * post and every slide of the carousel are this, so they cannot use
 * different words for the same fact.
 */
export function FlareCardSlide({
  card,
  direction,
  post,
  siblings,
  position,
  width,
  cardWidth = 72,
}: {
  card: FeedCard;
  direction: "want" | "showcase";
  post?: PostRef;
  /** The shelf the zoom pages along: every card in the post. */
  siblings: ZoomCard[];
  position: number;
  /** The slide's width, when it sits in the carousel. */
  width?: number;
  cardWidth?: number;
}) {
  const remaining = remainingOf(card);
  const count =
    direction === "showcase"
      ? availableLabel(copiesOf(card))
      : card.state === "found"
        ? "Found"
        : needLabel(remaining);

  return (
    <View
      style={{
        width,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing(3),
      }}
    >
      <CardImage
        imageUrl={card.imageUrl}
        width={cardWidth}
        name={card.cardName}
        cardNumber={card.cardNumber}
        caption={card.printingLabel ?? null}
        youHave={card.match ? { kind: card.match, count: 0 } : undefined}
        state={card.state}
        have={haveFor(card, post)}
        siblings={siblings}
        position={position}
      />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text
          numberOfLines={2}
          style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "800" }}
        >
          {card.cardName}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 13 }}>
          {`${card.cardNumber} · ${printingLabel(card.printingLabel)}`}
        </Text>
        <Text
          style={{
            color:
              card.state === "found" || remaining === 0
                ? colors.textMuted
                : colors.accent,
            fontSize: 13,
            fontWeight: "700",
          }}
        >
          {count}
        </Text>
        {card.match ? (
          <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "600" }}>
            {card.match === "exact" ? "You have this" : "You have another printing"}
          </Text>
        ) : null}
        {card.youOffered ? (
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            You said you have this
          </Text>
        ) : card.state === "offered" ? (
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
            Somebody offered
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function FlareCarousel({
  cards,
  total,
  direction,
  post,
  remainingCopies,
  onViewAll,
}: {
  cards: FeedCard[];
  /** How many they posted, which can exceed what is shown. */
  total: number;
  direction: "want" | "showcase";
  post?: PostRef;
  /** The server's count across the whole post, when it sent one. */
  remainingCopies?: number;
  /** "View all 3": the full list, in a sheet. */
  onViewAll?: () => void;
}) {
  const [at, setAt] = useState(0);
  const [width, setWidth] = useState(0);
  const slide = Math.max(0, width - PEEK - GAP);
  const page = slide + GAP;
  const shelf = shelfFor(cards, post);
  const remaining = remainingAcross(cards, direction, remainingCopies);

  return (
    <View
      style={{
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.elevated,
        padding: spacing(3),
        gap: spacing(2.5),
      }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width - spacing(6))}
    >
      {width > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={page}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          contentContainerStyle={{ gap: GAP, paddingRight: PEEK + GAP }}
          onMomentumScrollEnd={(event) => {
            const landed = Math.round(event.nativeEvent.contentOffset.x / page);
            if (landed >= 0 && landed < cards.length) setAt(landed);
          }}
        >
          {cards.map((card, index) => (
            <FlareCardSlide
              key={card.cardId}
              card={card}
              direction={direction}
              post={post}
              siblings={shelf}
              position={index}
              width={slide}
            />
          ))}
        </ScrollView>
      ) : null}

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing(2),
        }}
      >
        <View style={{ flexDirection: "row", gap: spacing(1.5), flexShrink: 1 }}>
          {cards.map((card, index) => (
            <View
              key={card.cardId}
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: index === at ? colors.accent : colors.borderStrong,
              }}
            />
          ))}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>
          {`${at + 1} / ${cards.length}`}
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing(2),
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: spacing(2.5),
        }}
      >
        <Text style={{ color: colors.textSecondary, fontSize: 13, flexShrink: 1 }}>
          {direction === "showcase"
            ? `${copiesLabel(remaining)} available`
            : remaining > 0
              ? `${copiesLabel(remaining)} still needed`
              : "All found"}
        </Text>
        {onViewAll ? (
          <Tap
            onPress={onViewAll}
            hitSlop={6}
            accessibilityLabel={`View all ${total} cards`}
          >
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
              {`View all ${total}`}
            </Text>
          </Tap>
        ) : (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {cardsLabel(total)}
          </Text>
        )}
      </View>
    </View>
  );
}
