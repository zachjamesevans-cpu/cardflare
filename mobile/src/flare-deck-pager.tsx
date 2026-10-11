import { ScrollView, Text, View } from "react-native";

import type { FeedCard } from "./api";
import { availableLabel, GONE_LABEL, printingLabel } from "./flare-copy";
import { seeAllLabel, wantsLine } from "./offer-copy";
import { HeldRing } from "./held-ring";
import { QuantityBadge } from "./quantity-badge";
import { haveFor, type PostRef } from "./post-social";
import { colors, radius, spacing } from "./theme";
import { CardImage, Tap, type ZoomCard, type ZoomHave, type ZoomPicks } from "./ui";

/**
 * A Flare's cards on the Feed: one card as a row (`FlareCardSlide`),
 * several as a strip (`FlareStrip`, below, which replaced the carousel
 * this note goes on to describe).
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
      <View>
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
        {/* Inset: the pager clips anything outside the slide. */}
        <HeldRing match={card.match} inset />
      </View>
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
            /* White, not the accent: green is kept for the status line
               and the one action, so it still means something. */
            color:
              card.state === "found" || remaining === 0
                ? colors.textMuted
                : colors.textPrimary,
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

/**
 * How many are still wanted, as the small black ×N tag every other count
 * of copies wears - the binder's "lowkey black and white box" - top left.
 * Compact's tiles and the classic strip both wear it, so the two modes
 * say a count the same way.
 *
 * This was a green "1x" chip, bottom right, made half again as big when
 * the founder asked. With one copy on almost every card it was mostly
 * noise, sat over the art and covered the OFFERED band ("OFFE 3x"). The
 * founder, on the Feed: "seems to take up a lot of the screen", then,
 * after trying stacked copies: "just stick to the black quantity thing
 * tbh that we have elsewhere". So one copy draws nothing, as everywhere.
 * The classic strip printed "Wants 4" under every card until the founder:
 * "should just list quantity wanted somewhere... that's how it is in
 * compact".
 *
 * It says what is STILL wanted, not what was asked for - a card three
 * of four found is a card somebody needs one of, and the number that
 * helps is the one you could answer today.
 */
export function NeedBadge({
  card,
  offering,
  size = "sm",
}: {
  card: FeedCard;
  offering: boolean;
  size?: "sm" | "md";
}) {
  const wanted = card.remaining ?? card.quantity ?? 1;
  const done = card.state === "found" || (!offering && wanted <= 0);

  /* The tile's own foot says FOUND; a second tick on top of it was
     the founder's "overlapping gray checkmark thing". */
  if (done) return null;

  return (
    <QuantityBadge
      quantity={wanted}
      size={size}
      style={{ position: "absolute", top: 4, left: 4 }}
    />
  );
}

/** A strip tile's width: two and a half across a phone, so it scrolls. */
export const STRIP_TILE = 108;

/**
 * A multi-card Flare, as a strip: every card's art at once, the count
 * still wanted as compact's black ×N tag on it, the name under it,
 * swiped sideways.
 *
 * This was a carousel of one wide slide at a time, inside a panel of its
 * own, with a dot per card and "See all 17 cards" under it. A seventeen-
 * card hunt showed one card and a sliver; the founder: "compact is great
 * because it just shows the cards simply". So classic is compact, bigger:
 * the art first, the words beneath, no inner panel and no dots. The strip
 * runs to the post's edges (`bleed`) so the card that peeks in is cut by
 * the post, not by a box inside it. The printing lives in the zoom a tap
 * away, and the full list behind the three dots, as before.
 */
export function FlareStrip({
  cards,
  total,
  direction,
  post,
  picks,
  onPicks,
  onSeeAll,
  bleed = 0,
}: {
  cards: FeedCard[];
  /** Cards on the post, when the Feed only carried some of them. */
  total?: number;
  direction: "want" | "showcase";
  post?: PostRef;
  /** The post's offer in progress, handed through to the zoom. */
  picks?: ZoomPicks;
  onPicks?: (picks: ZoomPicks) => void;
  /** The full-list sheet, the one the menu opens: the "+N" tile's door. */
  onSeeAll?: () => void;
  /** The parent's side padding, so the strip can run to its edges. */
  bleed?: number;
}) {
  const shelf = shelfFor(cards, post);
  const more = Math.max(0, (total ?? cards.length) - cards.length);
  const height = Math.round((STRIP_TILE * 88) / 63);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -bleed }}
      contentContainerStyle={{
        gap: GAP,
        paddingHorizontal: bleed,
        /* Room for a held card's ring, which sits just outside. */
        paddingVertical: 4,
      }}
    >
      {cards.map((card, index) => {
        const done =
          card.state === "found" || (direction === "want" && remainingOf(card) === 0);
        return (
          <View key={card.cardId} style={{ width: STRIP_TILE, gap: 3 }}>
            <View>
              <CardImage
                imageUrl={card.imageUrl}
                width={STRIP_TILE}
                name={card.cardName}
                cardNumber={card.cardNumber}
                caption={card.printingLabel ?? null}
                youHave={card.match ? { kind: card.match, count: 0 } : undefined}
                state={card.state}
                have={haveWithCap(card, post)}
                siblings={shelf}
                position={index}
                picks={picks}
                onPicks={onPicks}
              />
              <HeldRing match={card.match} corner="right" />
              <NeedBadge card={card} offering={direction === "showcase"} size="md" />
            </View>
            <Text
              numberOfLines={1}
              style={{
                color: done ? colors.textMuted : colors.textPrimary,
                fontSize: 13,
                fontWeight: "700",
                marginTop: 3,
              }}
            >
              {card.cardName}
            </Text>
          </View>
        );
      })}
      {more > 0 && onSeeAll ? (
        <Tap
          onPress={onSeeAll}
          accessibilityLabel={seeAllLabel(total ?? cards.length)}
          style={{
            width: STRIP_TILE,
            height,
            borderRadius: radius.control / 2,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.elevated,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "800" }}>
            +{more}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>more</Text>
        </Tap>
      ) : null}
    </ScrollView>
  );
}
