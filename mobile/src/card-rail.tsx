import { ScrollView } from "react-native";

import type { FeedCard } from "./api";
import { haveFor, type PostRef } from "./post-social";
import { spacing } from "./theme";
import { CardImage, Muted, type ZoomCard } from "./ui";

/** How wide a tile is: one card reads as a card, a deck as a row. */
export function tileWidth(count: number): number {
  if (count <= 1) return 160;
  return 96;
}

/**
 * A row of cards you can see all of.
 *
 * The founder, on a friend's hunt that read "+4 more": "it should be a
 * carousel for these types of things... so you can see all the cards."
 * Four tiles and a count told you how much you were missing without
 * showing you any of it, which on the one row about what a friend is
 * chasing is the whole content of the row.
 *
 * A plain horizontal ScrollView, the same rail the showcase and the
 * dressing picker already use - no library and no snapping. The count
 * only survives past the server's CARD_RAIL_CAP, where it stops meaning
 * "we hid some" and starts meaning "the rest are on the board".
 */
export function CardRail({
  cards,
  more = 0,
  width,
  post,
}: {
  cards: FeedCard[];
  /** Cards past the server's cap, which live on the board. */
  more?: number;
  width: number;
  /** The post these cards belong to, when they can be answered. */
  post?: PostRef;
}) {
  /* The shelf the zoom pages along. Built from the same array the rail
     draws, so what you swipe through is exactly what you can see. */
  const shelf: ZoomCard[] = cards.map((card) => ({
    imageUrl: card.imageUrl,
    name: card.cardName,
    cardNumber: card.cardNumber,
    youHave: card.match ? { kind: card.match, count: 0 } : null,
    have: haveFor(card, post),
  }));

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        gap: spacing(2),
        alignItems: "center",
        paddingVertical: spacing(0.5),
      }}
    >
      {cards.map((card, index) => (
        <CardImage
          key={card.cardId}
          imageUrl={card.imageUrl}
          width={width}
          name={card.cardName}
          cardNumber={card.cardNumber}
          youHave={card.match ? { kind: card.match, count: 0 } : undefined}
          state={card.state}
          have={haveFor(card, post)}
          /*
           * The rest of the rail, so an opened card can be swiped along
           * it. The founder: "when there's a card u click on anywhere,
           * for example someones flares, you cant swipe between the
           * cards on the app. u can on the website though."
           *
           * The zoom has always been able to do this - `siblings` and
           * the swipe that reads it are already in CardImage, and Room
           * and Local both hand it a shelf. The Feed never did, so its
           * cards opened one at a time and closed again, which is the
           * one place somebody is browsing rather than working.
           */
          siblings={shelf}
          position={index}
        />
      ))}
      {more > 0 ? <Muted>{`+${more} more`}</Muted> : null}
    </ScrollView>
  );
}
