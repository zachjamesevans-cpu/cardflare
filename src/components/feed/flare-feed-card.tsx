import Link from "next/link";
import { Crosshair, Heart, MessageCircle } from "lucide-react";

import { FeedTile, haveFor } from "@/components/feed/feed-tile";
import { FlareCardsSheet } from "@/components/feed/flare-cards-sheet";
import { FlareCarousel } from "@/components/feed/flare-carousel";
import { FlareProgressSheet } from "@/components/feed/flare-progress-sheet";
import { GuestChip } from "@/components/feed/feed-person";
import { PostSocial } from "@/components/feed/post-social";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { cardCountLabel } from "@/lib/feed/card-copy";
import type { ZoomCard } from "@/components/cards/card-image-zoom";
import type { HuntItem } from "@/lib/feed/repository";

/**
 * One Flare on the Feed, drawn as a post.
 *
 * A post is one person, one caption, one or many cards. The header
 * says who and which way ("is looking for" or "is offering") and how many
 * cards; the caption is theirs; a hunt the post belongs to is one line
 * with a door to it. The cards are slides - the picture beside what
 * matters about it - and the whole list is one press away with the
 * boxes to say which you have. The heart and the thread belong to the
 * post. The app draws the same card natively
 * (mobile/src/flare-feed-card.tsx).
 */

/** How long ago, in the shortest true form. */
export function agoFrom(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
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
 */
function statusLabel(item: HuntItem): string {
  return item.direction === "showcase" ? "is offering" : "is looking for";
}

/**
 * The crosshair and the words: CardFlare's status line.
 *
 * A targeting reticle in the accent with a faint glow behind it, then
 * "is looking for" in the same green. Meant to be the recognisable mark of
 * a Flare wherever one is drawn, so it is one component and nothing
 * else draws the pair. An offer wears the same reticle without the
 * glow: the mark is the same, the aim is not.
 */
export function FlareStatus({
  label = "is looking for",
  glow = true,
}: {
  label?: string;
  glow?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5 text-sm font-semibold text-accent">
      <Crosshair
        className={cn(
          "size-[17px] shrink-0",
          glow && "drop-shadow-[0_0_5px_rgba(198,238,79,0.7)]",
        )}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

/** Looking for, Trade, Cash ok: the primary one filled, the rest outlined. */
export function FlareTypeChip({
  label,
  primary = false,
}: {
  label: string;
  primary?: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-bold",
        primary
          ? "border-accent bg-accent text-accent-contrast"
          : "border-border-strong text-text-secondary",
      )}
    >
      {label}
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
  const direction = item.direction === "showcase" ? "showcase" : "want";
  const lead = item.cards[0];
  const single = item.total === 1 && lead;
  const post = { postId: item.postId, yours: item.yours || preview };

  const chips = (
    <>
      <FlareTypeChip
        label={direction === "showcase" ? "Offering" : "Looking for"}
        primary
      />
      {item.acceptsTrade && <FlareTypeChip label="Trade" />}
      {item.acceptsCash && <FlareTypeChip label="Cash ok" />}
    </>
  );

  /* The zoom pages along the whole deck from any card. */
  const shelf: ZoomCard[] = item.cards.map((card) => ({
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
  }));

  const tiles = item.cards.map((card, index) => (
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

  return (
    <article className="flex flex-col gap-2.5 rounded-[20px] border border-border bg-surface p-3 shadow-[var(--shadow-card)]">
      {/* The header: face, name, the status line; time and distance on
          the right. "Your Flare" is a small label inside this row, never
          a line between posts. */}
      <div className="flex items-start gap-3">
        <Link
          href={`/p/${item.playerId}`}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[var(--radius-control)] transition-colors hover:bg-elevated/60"
        >
          <PlayerAvatar
            displayName={item.displayName}
            seed={item.playerId}
            avatarUrl={item.avatarUrl}
            frame={item.frame}
            ring={item.ring}
            size="md"
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-base font-extrabold text-text-primary">
                {item.displayName}
              </span>
              {!item.playerId && <GuestChip />}
              {item.yours && !preview && (
                <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-text-muted uppercase">
                  Your Flare
                </span>
              )}
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              <FlareStatus label={statusLabel(item)} glow={direction === "want"} />
              {item.total > 1 && (
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-bold text-text-secondary tabular-nums">
                  {item.total} cards
                </span>
              )}
            </span>
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-1 text-[13px] text-text-muted">
          <span>{agoFrom(item.postedAt)}</span>
          {typeof item.milesAway === "number" && (
            <span className="flex items-center gap-1">
              <span aria-hidden="true">·</span>
              {awayLabel(item.milesAway)}
            </span>
          )}
        </div>
      </div>

      {/* What they wrote with it. Nothing at all when they wrote nothing. */}
      {item.note && (
        <p className="text-sm leading-relaxed text-text-secondary">
          &ldquo;{item.note}&rdquo;
        </p>
      )}

      {/* The hunt it belongs to, with a door: "Green Zoro · View hunt". */}
      {item.hunt && (
        <p className="flex items-center gap-1.5 text-sm">
          <span className="truncate font-semibold text-text-primary">
            {item.hunt.name}
          </span>
          <span className="text-text-muted" aria-hidden="true">
            ·
          </span>
          {preview ? (
            <span className="shrink-0 text-text-secondary">View hunt</span>
          ) : (
            <Link
              href={`/hunts/${item.hunt.id}`}
              className="shrink-0 font-semibold text-accent hover:underline"
            >
              View hunt
            </Link>
          )}
        </p>
      )}

      {/* The cards: one beside its details, or slides. */}
      {single ? (
        <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-border bg-elevated/60 p-2.5">
          {tiles[0]}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
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
            {lead.youOffered ? (
              <p className="text-xs text-text-secondary">You said you have this</p>
            ) : lead.state === "offered" ? (
              <p className="text-xs text-text-secondary">Somebody offered</p>
            ) : null}
          </div>
        </div>
      ) : (
        <FlareCarousel cards={item.cards} direction={direction} tiles={tiles} />
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {chips}
        {!single && item.youCanAnswer > 0 && (
          <span className="text-xs font-semibold text-accent">
            You can answer {item.youCanAnswer} of {item.total}
          </span>
        )}
      </div>

      {/* The counts and the doors: the full list, and the one action
          the post is for. The author updates; anyone else offers. */}
      {preview ? (
        <p className="text-sm font-semibold text-text-secondary tabular-nums">
          {direction === "showcase"
            ? `${item.cards.reduce((sum, card) => sum + (card.quantity ?? 1), 0)} copies available`
            : `${item.remainingCopies} ${item.remainingCopies === 1 ? "copy" : "copies"} still needed`}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <FlareCardsSheet
            postId={item.postId}
            cards={item.cards}
            total={item.total}
            direction={direction}
            yours={item.yours}
            completed={item.completed}
            remainingCopies={item.remainingCopies}
          />
          {item.yours &&
            direction === "want" &&
            item.cards.some((card) => card.flareId) && (
              <div>
                <FlareProgressSheet cards={item.cards} completed={item.completed} />
              </div>
            )}
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
                  cardName: lead.cardName,
                  posterName: item.displayName,
                }
          }
        />
      )}

      {/* Every post that HAS a place ends in one. */}
      {item.code && item.storeName ? (
        <Link href={`/e/${item.code}`} className={buttonStyles("secondary", "sm")}>
          Go to {item.storeName}
        </Link>
      ) : null}
    </article>
  );
}
