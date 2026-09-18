import { Layers, PackageCheck } from "lucide-react";

import {
  CardImageZoom,
  type ZoomCard,
  type ZoomHave,
} from "@/components/cards/card-image-zoom";
import { cardImagesEnabled } from "@/lib/cards/images";
import type { FeedCard } from "@/lib/feed/repository";

/**
 * The card tiles the Feed draws, in their own module so a post and the
 * rest of the items can share them without importing each other.
 */

export function tileWidth(count: number): "lg" | "md" {
  if (count <= 1) return "lg";
  return "md";
}

export const TILE_CLASS = {
  lg: "w-40",
  md: "w-24",
  sm: "w-14",
  pager: "w-28",
} as const;

/**
 * A row of cards you can see all of.
 *
 * The founder, on a friend's hunt that read "+4 more": "it should be a
 * carousel for these types of things... so you can see all the cards."
 * Four tiles and a count told you how much you were missing without
 * showing you any of it, which on the one row about what a friend is
 * chasing is the whole content of the row.
 *
 * So it scrolls. `overflow-x-auto` with `shrink-0` tiles is the whole
 * mechanism - no library, no snapping, and it stays a plain flex row for
 * anyone whose rail is short enough not to scroll at all. The count only
 * survives past CARD_RAIL_CAP on the server, where it stops being "we
 * hid some" and becomes "the rest are on the board".
 */
/**
 * "I have this" for one card of a post, or null where it makes no sense:
 * your own post, a card that already traded, an item that is not a post.
 */
export function haveFor(
  card: FeedCard,
  post: { postId: string; yours: boolean } | undefined,
): ZoomHave | null {
  if (!post || post.yours || !card.flareId || card.state === "found") return null;
  return {
    postId: post.postId,
    flareId: card.flareId,
    state: card.state ?? "open",
    youOffered: card.youOffered ?? false,
  };
}

export function CardRail({
  cards,
  more,
  size = "md",
  post,
}: {
  cards: FeedCard[];
  /** Cards past the server's cap, which live on the board. */
  more?: number;
  size?: "lg" | "md";
  /** The post these cards belong to, when they can be answered. */
  post?: { postId: string; yours: boolean };
}) {
  /* The shelf the zoom pages along. Built from the same array the rail
     draws, so what you swipe through is exactly what you can see. */
  const shelf: ZoomCard[] = cards.map((card) => ({
    imageUrl: card.imageUrl,
    exactName: card.cardName,
    cardNumber: card.cardNumber,
    youHave: card.match ? { kind: card.match, count: 0 } : null,
    have: haveFor(card, post),
  }));

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {cards.map((card, index) => (
        <div key={card.cardId} className="flex shrink-0">
          <FeedTile
            imageUrl={card.imageUrl}
            name={card.cardName}
            cardNumber={card.cardNumber}
            match={card.match}
            size={size}
            siblings={shelf}
            position={index}
            state={card.state}
            have={haveFor(card, post)}
          />
        </div>
      ))}
      {more && more > 0 ? (
        <p className="shrink-0 self-center text-xs whitespace-nowrap text-text-muted tabular-nums">
          +{more} more
        </p>
      ) : null}
    </div>
  );
}

/**
 * One card, at the size the feed shows cards, and the way to see it big.
 *
 * The founder, on the phone: "I can't click the images in the feed to
 * open the bigger view." The app's feed has opened the zoom since the
 * rails were made swipeable; the website's drew the same art as a plain
 * picture. So the tile is now the opener for the same `CardImageZoom`
 * every board and shelf on the site uses - tap for the large view, and
 * a rail hands over the whole shelf so the viewer pages along it
 * without closing. The picture itself is unchanged: when art is off or
 * a card has none, the zoom returns the tile as it was.
 */
export function FeedTile({
  imageUrl,
  name,
  cardNumber,
  match,
  size = "sm",
  siblings,
  position,
  state = "open",
  direction = "want",
  have = null,
}: {
  imageUrl: string | null;
  name: string;
  cardNumber: string;
  size?: "lg" | "md" | "sm" | "pager";
  /** The rest of the rail this tile sits in, and where in it. */
  siblings?: ZoomCard[];
  position?: number;
  /**
   * OFFERED or FOUND, on a post's card. Only this tile dims - the
   * founder: "do not gray out the whole Flare". The badge says which.
   */
  state?: "open" | "offered" | "found";
  /** Which way the post points: a found card on an offer reads GONE. */
  direction?: "want" | "showcase";
  /** "I have this" in the large view, when the viewer can say so. */
  have?: ZoomHave | null;
  /**
   * What the viewer's binder says, or null for nothing.
   *
   * Nullable since a friend's hunt shows cards the viewer does NOT hold
   * — seeing what a friend is chasing is the point. An unheld card is
   * drawn plain: the green ring means "you have this" everywhere in the
   * product, and a ring on a card you do not own would be a lie in the
   * one place it is loudest.
   */
  match: "exact" | "other-printing" | null;
}) {
  const art = (
    <span
      title={
        match === "exact"
          ? `You have ${name}`
          : match
            ? "You have another printing"
            : name
      }
      /* The board's own mark for a card you are holding, so the feed and
         the room are not two dialects of the same fact. */
      className={`relative block ${TILE_CLASS[size]} shrink-0 overflow-hidden rounded-[6px] border bg-elevated ${
        match
          ? "border-border shadow-[0_0_10px_rgba(198,238,79,0.35)] ring-2 ring-accent"
          : "border-border"
      }`}
    >
      <span
        className={`block aspect-[60/84] w-full ${
          state === "offered"
            ? "opacity-50 grayscale"
            : state === "found"
              ? /* Full black and white, the founder's call: "so it's
                   more obvious". The foot says the word. */
                "opacity-60 grayscale"
              : ""
        }`}
      >
        {imageUrl && (
          /*
           * CONTAIN, NOT COVER. The box is the physical card's ratio
           * (2.5 x 3.5 = 0.714), but a scan carries a margin and comes
           * in at 600x825 = 0.727. Cover filled the height and cut the
           * sides off - taking the card's own border with them, which
           * is what the founder saw: "the images for the cards are
           * quite pixelated and distorted... it is clearly rendering
           * incorrectly." Contain shows the whole card and never
           * squeezes it; the elevated ground behind takes up the
           * one-percent difference.
           */
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={imageUrl} alt="" className="size-full object-contain" />
        )}
      </span>
      {state !== "open" && (
        /* The one-word state, pinned to the foot of the card so the
           art above it still reads as the card it is. */
        <span
          className={`pointer-events-none absolute inset-x-0 bottom-0 py-0.5 text-center text-[9px] font-bold tracking-wider uppercase ${
            state === "found"
              ? "bg-accent text-accent-contrast"
              : "bg-surface/90 text-text-secondary"
          }`}
        >
          {state === "found" && direction === "showcase" ? "gone" : state}
        </span>
      )}
      {match && (
        <span className="pointer-events-none absolute top-0.5 left-0.5 rounded-full bg-surface/90 p-0.5">
          {match === "exact" ? (
            <PackageCheck className="size-3 text-accent" aria-hidden="true" />
          ) : (
            <Layers className="size-3 text-accent" aria-hidden="true" />
          )}
        </span>
      )}
    </span>
  );

  return (
    <CardImageZoom
      imageUrl={imageUrl}
      exactName={name}
      cardNumber={cardNumber}
      enabled={cardImagesEnabled()}
      /* The ring already says it across the row; the sentence is what
         the tap is for, same as the board and the app. */
      youHave={match ? { kind: match, count: 0 } : null}
      have={have}
      siblings={siblings}
      position={position}
      thumb={art}
    />
  );
}
