import { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import type { FeedCard } from "./api";
import { availableLabel, GONE_LABEL, printingLabel } from "./flare-copy";
import { seeAllLabel, wantsLine } from "./offer-copy";
import { haveFor, type PostRef } from "./post-social";
import { colors, radius, spacing } from "./theme";
import { CardImage, Tap, type ZoomCard, type ZoomHave, type ZoomPicks } from "./ui";

/**
 * A multi-card Flare on the Feed: compact slides, one card each.
 *
 * The first pager was the founder's concept render, a hero card with
 * its neighbours peeking and a strip of thumbnails under it. It stood
 * taller than the post around it and said nothing about copies, which
 * are the whole point now that a Flare can ask for two of something.
 *
 * So each slide is the single-card row: the art beside its name, the
 * printing asked for and "Wants 2" (or "Need 1 more" once one is
 * found), and the next slide peeks in from the right so the swipe is
 * discoverable. Dots say where you are; the count line and "View all"
 * that used to sit under them moved behind the post's three dots, the
 * founder wanting the post concise and its extras "only visible when
 * you need it". Round 16 put one door back on the dots row, right
 * aligned: "See all 4 cards", because the audit found the full list
 * "hidden: it's only in the ⋯ menu". The menu entry stays.
 *
 * Every card is the same CardImage the rest of the Feed draws, so a
 * tap still opens the zoom with "I have this card" inside it, and the
 * post's picks ride through here to that zoom.
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

/**
 * "I have this card" for one card of a post, with the cap the review
 * steps up to: the copies the post still wants of it.
 */
export function haveWithCap(
  card: FeedCard,
  post: PostRef | undefined,
): ZoomHave | null {
  const have = haveFor(card, post);
  return have ? { ...have, remaining: remainingOf(card) } : null;
}

/** The shelf the zoom pages along, built from the cards it draws. */
export function shelfFor(cards: FeedCard[], post: PostRef | undefined): ZoomCard[] {
  return cards.map((card) => ({
    imageUrl: card.imageUrl,
    name: card.cardName,
    cardNumber: card.cardNumber,
    caption: card.printingLabel ?? null,
    youHave: card.match ? { kind: card.match, count: 0 } : null,
    have: haveWithCap(card, post),
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
  picks,
  onPicks,
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
  /** The post's offer in progress, handed through to the zoom. */
  picks?: ZoomPicks;
  onPicks?: (picks: ZoomPicks) => void;
}) {
  const remaining = remainingOf(card);
  const count =
    direction === "showcase"
      ? card.state === "found"
        ? GONE_LABEL
        : availableLabel(copiesOf(card))
      : wantsLine(copiesOf(card), remaining);

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
        have={haveWithCap(card, post)}
        siblings={siblings}
        position={position}
        picks={picks}
        onPicks={onPicks}
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
            You offered this
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
  direction,
  post,
  picks,
  onPicks,
  onSeeAll,
}: {
  cards: FeedCard[];
  direction: "want" | "showcase";
  post?: PostRef;
  /** The post's offer in progress, handed through to the zoom. */
  picks?: ZoomPicks;
  onPicks?: (picks: ZoomPicks) => void;
  /** "See all 4 cards": the full-list sheet, the one the menu opens. */
  onSeeAll?: () => void;
}) {
  const [at, setAt] = useState(0);
  const [width, setWidth] = useState(0);
  const slide = Math.max(0, width - PEEK - GAP);
  const page = slide + GAP;
  const shelf = shelfFor(cards, post);

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
              picks={picks}
              onPicks={onPicks}
            />
          ))}
        </ScrollView>
      ) : null}

      {/* The dots on the left, the door to the full list on the right. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing(2),
        }}
      >
        <View style={{ flexDirection: "row", gap: spacing(1.5) }}>
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
        {onSeeAll && cards.length > 1 ? (
          <Tap
            onPress={onSeeAll}
            hitSlop={8}
            accessibilityLabel={seeAllLabel(cards.length)}
          >
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
              {seeAllLabel(cards.length)}
            </Text>
          </Tap>
        ) : null}
      </View>
    </View>
  );
}
