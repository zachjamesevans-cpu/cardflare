import Link from "next/link";
import { CheckCircle2, Crosshair, PackageOpen } from "lucide-react";

import { FeedTile, haveFor } from "@/components/feed/feed-tile";
import { PostMenu, UnlessHidden } from "@/components/feed/post-actions";
import { PostSocial } from "@/components/feed/post-social";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { QuantityBadge } from "@/components/ui/quantity-badge";
import { agoFrom } from "@/components/feed/flare-feed-card";
import type { ZoomCard } from "@/components/cards/card-image-zoom";
import type { FeedCard, HuntItem } from "@/lib/feed/repository";

/**
 * The COMPACT view: a post as a strip of card art.
 *
 * The founder: "let's make a compact view. maybe a carousel of just the
 * card art and a green quantity count of the card they're needing on
 * the card. so if it's a bonney, the bottom right will show a '1x'...
 * focus on making things contexual - only popping up when needed. one
 * flare takes up the whole screen right now pretty much."
 *
 * The website's half of mobile/src/flare-feed-card-compact.tsx - same
 * rule, same subtractions. Everything that is not the art or the count
 * only appears when its absence would cost somebody something: a term
 * that is not the ordinary trade, a note somebody wrote. Names, numbers,
 * chips, progress bars and buttons all go, because each is a tap away
 * on the card itself and together they are what made one post fill a
 * screen.
 */
export function FlareFeedCardCompact({ item }: { item: HuntItem }) {
  const post = { postId: item.postId, yours: item.yours };
  const offering = item.direction === "showcase";

  const shelf: ZoomCard[] = item.cards.map((card) => ({
    imageUrl: card.imageUrl,
    exactName: card.cardName,
    cardNumber: card.cardNumber,
    /* Which version, said in the zoom: the compact tile has no room
       for the words, so the tap is where "Alternate Art" is read. */
    caption: card.printingLabel ?? null,
    anyPrinting: !card.printingId,
    youHave: card.match ? { kind: card.match, count: 0 } : null,
    have: haveFor(card, post),
  }));

  /* Cash is the only term that is not the default, so it is the only
     one worth a word. "Want · Trade" on every post said nothing. */
  const terms = item.acceptsCash
    ? item.acceptsTrade
      ? "Trade or cash"
      : "Cash"
    : null;

  /* Taken down or blocked, the post leaves on the same paint as the
     status line, in this view as in the classic one. */
  return (
    <UnlessHidden postId={item.postId} playerId={item.playerId || null}>
      <article className="flex flex-col gap-2 rounded-[16px] border border-border bg-surface px-2.5 py-2">
        {/* One line: face, name, which way it points, when. */}
        <div className="flex items-center gap-2">
          <Link
            href={`/p/${item.playerId}`}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-control)] transition-colors hover:bg-elevated/60"
          >
            <PlayerAvatar
              displayName={item.displayName}
              seed={item.playerId}
              avatarUrl={item.avatarUrl}
              frame={item.frame}
              ring={item.ring}
              size="sm"
            />
            <span className="truncate text-sm font-bold text-text-primary">
              {item.displayName}
            </span>
            {/* Which way it points, as a glyph; a finished post wears the
              check-circle instead, the same mark the classic card's
              status line wears. No done line anywhere: every tile
              below already carries its tick. */}
            {item.completed ? (
              <CheckCircle2
                className="size-3.5 shrink-0 text-accent"
                aria-hidden="true"
              />
            ) : offering ? (
              <PackageOpen
                className="size-3.5 shrink-0 text-accent"
                aria-hidden="true"
              />
            ) : (
              <Crosshair className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
            )}
          </Link>
          <span className="shrink-0 text-[11px] text-text-muted">
            {agoFrom(item.postedAt)}
          </span>
          {/* The same three dots the classic card has: the full list and,
            on your own post, the progress ticks. The founder: "The 3
            dots contextual menu isn't present in the compact view." */}
          <PostMenu
            post={{
              postId: item.postId,
              cards: item.cards,
              total: item.total,
              direction: offering ? "showcase" : "want",
              yours: item.yours,
              completed: item.completed,
              playerId: item.playerId || null,
              playerName: item.displayName,
            }}
          />
        </div>

        {/* The strip. Scrolls inside itself, so a long post never makes
          the page scroll sideways. */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
          {item.cards.map((card, index) => (
            <div key={card.cardId} className="relative shrink-0">
              <FeedTile
                imageUrl={card.imageUrl}
                name={card.cardName}
                cardNumber={card.cardNumber}
                match={card.match}
                size="pager"
                state={card.state}
                direction={offering ? "showcase" : "want"}
                have={haveFor(card, post)}
                siblings={shelf}
                position={index}
              />
              <NeedBadge card={card} offering={offering} />
            </div>
          ))}
        </div>

        {(terms || item.note) && (
          <p className="line-clamp-2 text-xs text-text-secondary">
            {[terms, item.note && `“${item.note}”`].filter(Boolean).join(" · ")}
          </p>
        )}

        <PostSocial
          postId={item.postId}
          likes={item.likes}
          liked={item.liked}
          comments={item.comments}
          offers={item.offers}
          message={null}
        />
      </article>
    </UnlessHidden>
  );
}

/**
 * How many are still wanted, as the small black ×N tag every other count
 * of copies wears - the binder's "lowkey black and white box" - top left.
 * The app draws the same (mobile NeedBadge).
 *
 * This was a green "1x" chip, bottom right, made half again as big when
 * the founder asked. With one copy on almost every card it was mostly
 * noise, sat over the art and covered the OFFERED band. The founder, on
 * the Feed: "just stick to the black quantity thing tbh that we have
 * elsewhere". So one copy draws nothing, as everywhere.
 *
 * It says what is STILL wanted rather than what was asked for - a card
 * three of four found is a card somebody needs one of.
 */
function NeedBadge({ card, offering }: { card: FeedCard; offering: boolean }) {
  const wanted = card.remaining ?? card.quantity ?? 1;
  const done = card.state === "found" || (!offering && wanted <= 0);

  /* The tile's own foot says FOUND; a second tick on top of it was
     the founder's "overlapping gray checkmark thing". */
  if (done) return null;

  return <QuantityBadge quantity={wanted} className="absolute top-1 left-1" />;
}
