import { foundLast } from "@/lib/feed/card-copy";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  Crosshair,
  Heart,
  MessageCircle,
} from "lucide-react";

import { FeedTile, haveFor } from "@/components/feed/feed-tile";
import { FlareCarousel, SingleFlare } from "@/components/feed/flare-carousel";
import {
  InYourOffer,
  OfferCardsButton,
  PostMenu,
  PostOffer,
  UnlessHidden,
} from "@/components/feed/post-actions";
import { GuestChip } from "@/components/feed/feed-person";
import { PostSocial } from "@/components/feed/post-social";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { cn } from "@/lib/cn";
import { cardCountLabel, postSubject } from "@/lib/feed/card-copy";
import type { ZoomCard } from "@/components/cards/card-image-zoom";
import type { HuntItem } from "@/lib/feed/repository";

/**
 * One Flare on the Feed, drawn as a post.
 *
 * A post is one person, one caption, one or many cards. The header
 * says who and which way ("is looking for" or "is offering") and how many
 * cards, and a post in a hunt says "is hunting" and names it, the name
 * the door to it; the caption is theirs. The cards are slides - the picture beside what
 * matters about it - and the whole list is one press away with the
 * toggles to say which you have. The heart and the thread belong to
 * the post. The app draws the same card natively
 * (mobile/src/flare-feed-card.tsx).
 *
 * THE POST OWNS THE OFFER. The picks a viewer makes along the cards
 * are the post's (`PostOffer`), so closing the viewer keeps them and
 * "2 in your offer · Review" says so under the cards until they are
 * sent. And a post that was just taken down leaves the list on the
 * same paint as its toast (`UnlessHidden`). Both are client wrappers
 * around this server-rendered card: the state is theirs, the markup
 * stays here.
 */

/**
 * How long ago, in the shortest true form.
 *
 * Under a minute is "now", not "1m ago": the composer's preview draws
 * the post the instant it is written, and a post written this second
 * that claimed a minute's age was the audit's first finding. The app's
 * `agoFrom` says the same (mobile/src/flare-feed-card.tsx).
 */
export function agoFrom(iso: string | null | undefined): string {
  /* A time that does not parse says nothing rather than "NaNd ago". */
  const at = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(at)) return "";
  const seconds = Math.max(0, (Date.now() - at) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** "2.1 mi away", or "nearby" under a mile. */
export function awayLabel(miles: number): string {
  if (miles < 1) return "nearby";
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi away`;
}

/**
 * What the person did, in two words.
 *
 * A Flare points one of two ways: wanted, or offered up. The count of
 * cards is its own chip beside this, so the line itself stays short.
 *
 * A finished post says so HERE and nowhere else. The founder, on the
 * All found / All gone line under the cards: "Delete... Just
 * clutters the feed. Remember, contextual." So the status line the
 * post already has changes tense instead: "found it" for one card,
 * "found them all" for several, "offered it all" for an offer. The
 * app's `statusLabel` says the same words (mobile/src/flare-feed-card.tsx).
 */
function statusLabel(item: HuntItem): string {
  if (item.completed) {
    if (item.direction === "showcase") return "offered it all";
    return item.total === 1 ? "found it" : "found them all";
  }
  if (item.direction === "showcase") return "is offering";
  /* The founder: "soupie posted 17 cards to her ace hunt. but it just
     says 'is looking for' with a little tiny ace 'view hunt' button
     below". A post in a hunt says so, and names it (see FlareStatus). */
  return item.hunt ? "is hunting" : "is looking for";
}

/**
 * The crosshair and the words: CardFlare's status line.
 *
 * A targeting reticle in the accent with a faint glow behind it, then
 * "is looking for" in the same green. Meant to be the recognisable mark of
 * a Flare wherever one is drawn, so it is one component and nothing
 * else draws the pair. An offer wears the same reticle without the
 * glow: the mark is the same, the aim is not. A finished post trades
 * the reticle for a check-circle and the glow goes out: nothing left
 * to aim at.
 */
export function FlareStatus({
  label = "is looking for",
  glow = true,
  done = false,
  hunt = null,
  linkHunt = true,
}: {
  label?: string;
  glow?: boolean;
  /** The post is complete: the check-circle instead of the crosshair, no glow. */
  done?: boolean;
  /**
   * The hunt the post went up in, named after the words - "is hunting
   * Ace <3" - and the door to it. This replaced the "Ace <3 · View
   * hunt" line under the post, which was the only sign it belonged to
   * a hunt and the easiest thing on it to miss.
   */
  hunt?: { id: string; name: string } | null;
  /** False in the composer's preview, where there is nowhere to go yet. */
  linkHunt?: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-accent">
      {done ? (
        <CheckCircle2
          className="size-[17px] shrink-0"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      ) : (
        <Crosshair
          className={cn(
            "size-[17px] shrink-0",
            glow && "drop-shadow-[0_0_5px_rgba(206,252,132,0.7)]",
          )}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      )}
      <span className="shrink-0">{label}</span>
      {/* The hunt as a name, not a button: white words and a small grey
          chevron, so it reads as a place that opens rather than the card
          wanted ("Green Zoro"), without the weight of a pill. The founder:
          "still dont think that big button for straw hat crew is the best
          option" - "lets try option a". The app draws the same. */}
      {hunt &&
        (linkHunt ? (
          <Link
            href={`/hunts/${hunt.id}`}
            aria-label={`View hunt ${hunt.name}`}
            className="flex min-w-0 items-center gap-0.5 font-bold text-text-primary hover:underline"
          >
            <span className="truncate">{hunt.name}</span>
            <ChevronRight
              className="size-3.5 shrink-0 text-text-muted"
              aria-hidden="true"
            />
          </Link>
        ) : (
          <span className="flex min-w-0 items-center font-bold text-text-primary">
            <span className="truncate">{hunt.name}</span>
          </span>
        ))}
    </span>
  );
}

export function FlareFeedCard({
  item,
  preview = false,
}: {
  item: HuntItem;
  /**
   * The composer's look before posting: the same card, with nothing
   * on it that would write to a post that does not exist yet.
   */
  preview?: boolean;
}) {
  const direction: "want" | "showcase" =
    item.direction === "showcase" ? "showcase" : "want";
  /* Found cards at the far right, whatever order they arrived in. */
  const cards = [...item.cards].sort(foundLast);
  const lead = cards[0];
  const single = item.total === 1 && lead;
  const post = { postId: item.postId, yours: item.yours || preview };
  /* What the menu, the offer button and the offer itself read. */
  const shape = {
    postId: item.postId,
    cards: cards,
    total: item.total,
    direction,
    yours: item.yours,
    completed: item.completed,
    /* A guest's post carries an empty id: nobody to block. */
    playerId: item.playerId || null,
    playerName: item.displayName,
  };

  /* The zoom pages along the whole deck from any card. */
  const shelf: ZoomCard[] = cards.map((card) => ({
    imageUrl: card.imageUrl,
    exactName: card.cardName,
    cardNumber: card.cardNumber,
    caption: card.printingLabel ?? null,
    anyPrinting: !card.printingId,
    direction,
    lookingFor: card.quantity ?? null,
    stillNeeds: direction === "want" ? (card.remaining ?? null) : null,
    youHave: card.match ? { kind: card.match, count: 0 } : null,
    have: preview ? null : haveFor(card, post),
    note: card.cardNote ?? null,
    state: card.state ?? "open",
    noteEdit: !preview && item.yours && card.flareId ? { flareId: card.flareId } : null,
  }));

  const tiles = cards.map((card, index) => (
    <FeedTile
      key={card.cardId}
      imageUrl={card.imageUrl}
      name={card.cardName}
      cardNumber={card.cardNumber}
      match={card.match}
      size="pager"
      state={card.state}
      direction={direction}
      have={preview ? null : haveFor(card, post)}
      siblings={shelf}
      position={index}
    />
  ));

  const article = (
    /* No panel: the post sits on the Feed's own green with a hairline
       under it, the app's FEED_LOOK "open". The founder (2026-10-11):
       "without the green 'blocks' in the feed ... the full background was
       just that dark gray green color". */
    <article className="flex flex-col gap-2.5 border-b border-border-strong/70 px-3 pt-1 pb-4">
      {/* The header: face, then the name with when and how far beside it,
          then the status line; the three dots at the right. "Your Flare"
          is a small label inside the name's row, never a line between
          posts. */}
      {/*
       * The face and the name open the profile; the status line sits
       * outside that link, because the hunt's name in it is a link of
       * its own and a link cannot hold another.
       */}
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Link
            href={`/p/${item.playerId}`}
            tabIndex={-1}
            aria-hidden="true"
            className="shrink-0 rounded-full"
          >
            <PlayerAvatar
              displayName={item.displayName}
              seed={item.playerId}
              avatarUrl={item.avatarUrl}
              frame={item.frame}
              ring={item.ring}
              size="md"
            />
          </Link>
          <span className="flex min-w-0 flex-col gap-0.5">
            {/* When and how far sit on the name's line, the way Instagram
                writes "name • 2h", so the status line below has the width
                for a hunt's pill. The app draws the same. */}
            <span className="flex min-w-0 items-center gap-1.5">
              <Link
                href={`/p/${item.playerId}`}
                className="flex min-w-0 items-center gap-1.5 hover:underline"
              >
                <span className="truncate text-base font-extrabold text-text-primary">
                  {item.displayName}
                </span>
                {!item.playerId && <GuestChip />}
                {item.yours && !preview && (
                  <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-text-muted uppercase">
                    Your Flare
                  </span>
                )}
              </Link>
              <span className="shrink-0 text-[13px] text-text-muted">
                · {agoFrom(item.postedAt)}
                {typeof item.milesAway === "number" &&
                  ` · ${awayLabel(item.milesAway)}`}
              </span>
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <FlareStatus
                label={statusLabel(item)}
                glow={direction === "want"}
                done={item.completed}
                hunt={item.hunt}
                linkHunt={!preview}
              />
              {item.total > 1 && !item.hunt && (
                <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-bold text-text-secondary tabular-nums">
                  {item.total} cards
                </span>
              )}
            </span>
          </span>
        </div>
        {/* The three dots alone at the right: the full list and, on your
            own post, the progress ticks. Nothing renders when there is
            nothing to offer. */}
        {!preview && (
          <div className="flex shrink-0 items-center">
            <PostMenu post={shape} />
          </div>
        )}
      </div>

      {/* What they wrote with it. Nothing at all when they wrote nothing. */}
      {item.note && (
        <p className="text-sm leading-relaxed text-text-secondary">
          &ldquo;{item.note}&rdquo;
        </p>
      )}

      {/* No hunt line: the hunt is named in the status line and opens
          from there ("is hunting Ace <3"). */}

      {/* The cards: one beside its details, or slides. */}
      {single ? (
        <SingleFlare card={lead} tile={tiles[0]}>
          <p className="line-clamp-2 text-base leading-tight font-extrabold text-text-primary">
            {lead.cardName}
          </p>
          <p className="text-xs text-text-secondary">{lead.cardNumber}</p>
          <p className="mt-0.5 text-sm font-semibold text-accent tabular-nums">
            {cardCountLabel(lead, direction)}
          </p>
          <p className="truncate text-xs text-text-muted">
            {lead.printingLabel ?? "Any printing"}
          </p>
          {lead.match && (
            <p className="text-xs font-semibold text-accent">
              {lead.match === "exact" ? "You have this" : "You have another printing"}
            </p>
          )}
        </SingleFlare>
      ) : (
        <FlareCarousel
          cards={cards}
          direction={direction}
          tiles={tiles}
          post={preview ? null : shape}
        />
      )}

      {/* "2 in your offer · Review": the picks, while the viewer is
          closed. Nothing until something is picked. */}
      {!preview && <InYourOffer />}

      {/* No row of chips under the cards. The status line in the header
          already says which way the post points, in the accent, and the
          founder read "Looking for" twice on every post: "Delete the
          'looking for' and trade/cash buttons... It's redundant when it
          already says it at the top in bright green." */}
      {!single && item.youCanAnswer > 0 && (
        <p className="text-xs font-semibold text-accent">
          You can answer {item.youCanAnswer} of {item.total}
        </p>
      )}

      {/* Nothing else under the cards: no done line (the status line in
          the header says "found them all"), no count line, no list
          button, no progress button. Those wait behind the dots in the
          corner; the founder: "only visible when you need it". */}
      {/* The one button a post is for: somebody else's want, still open. */}
      {!preview && direction === "want" && !item.yours && !item.completed && (
        <div>
          <OfferCardsButton post={shape} />
        </div>
      )}

      {preview ? (
        <div className="flex items-center gap-4 text-sm font-medium text-text-secondary">
          <span className="flex items-center gap-1.5">
            <Heart className="size-5" aria-hidden="true" />0
          </span>
          <span className="flex items-center gap-1.5">
            <MessageCircle className="size-5" aria-hidden="true" />0
          </span>
        </div>
      ) : (
        <PostSocial
          postId={item.postId}
          likes={item.likes}
          liked={item.liked}
          comments={item.comments}
          offers={item.offers}
          message={
            item.yours || !lead?.flareId
              ? null
              : {
                  flareId: lead.flareId,
                  /* The post's name for several cards, not the lead's. */
                  cardName: postSubject(item),
                  posterName: item.displayName,
                }
          }
        />
      )}

      {/* No room on the post, neither "at Card Cavern" on the name line
          nor "Go to Card Cavern" at the foot; the founder: "kinda
          redundant. remove that type of... CTA everywhere". */}
    </article>
  );

  if (preview) return article;

  return (
    <UnlessHidden postId={item.postId} playerId={shape.playerId}>
      <PostOffer post={shape}>{article}</PostOffer>
    </UnlessHidden>
  );
}
