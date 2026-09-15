import Link from "next/link";
import { Crosshair, MapPin } from "lucide-react";

import { FeedTile, haveFor } from "@/components/feed/feed-tile";
import { FlareDeckPager } from "@/components/feed/flare-deck-pager";
import { GuestChip } from "@/components/feed/feed-person";
import { PostSocial } from "@/components/feed/post-social";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { ZoomCard } from "@/components/cards/card-image-zoom";
import type { HuntItem } from "@/lib/feed/repository";

/**
 * One Flare on the Feed, drawn as a post.
 *
 * The founder's redesign: the card is the headline, then its name, then
 * who is hunting it, then what they will do for it, then where and when,
 * then the counts. The old row gave its weight to grey space; this one
 * gives it to the card, which is what a trader is scanning for.
 *
 * Every piece of behaviour is the one the Feed already had: the tap on
 * the card opens the same zoom with "I have this" inside it, the heart
 * and the bubble are the post's own, and the paper plane opens the same
 * conversation the Messages page opens. The app draws the same card
 * natively (mobile/src/flare-feed-card.tsx).
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
 * The crosshair and the words: CardFlare's status line.
 *
 * A targeting reticle in the accent with a faint glow behind it, then
 * "is hunting" in the same green. Meant to be the recognisable mark of
 * a Flare wherever one is drawn, so it is one component and nothing
 * else draws the pair.
 */
export function FlareStatus({ label = "is hunting" }: { label?: string }) {
  return (
    <span className="flex items-center gap-1.5 text-sm font-semibold text-accent">
      <Crosshair
        className="size-[17px] shrink-0 drop-shadow-[0_0_5px_rgba(198,238,79,0.7)]"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

/** Want, Trade, Cash ok: the primary one filled, the rest outlined. */
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

export function FlareFeedCard({ item }: { item: HuntItem }) {
  const lead = item.cards[0];
  const single = item.total === 1 && lead;
  const post = { postId: item.postId, yours: item.yours };

  const chips = (
    <>
      <FlareTypeChip label="Want" primary />
      {item.acceptsTrade && <FlareTypeChip label="Trade" />}
      {item.acceptsCash && <FlareTypeChip label="Cash ok" />}
    </>
  );

  /* The zoom pages along the whole deck from any card. */
  const shelf: ZoomCard[] = item.cards.map((card) => ({
    imageUrl: card.imageUrl,
    exactName: card.cardName,
    cardNumber: card.cardNumber,
    youHave: card.match ? { kind: card.match, count: 0 } : null,
    have: haveFor(card, post),
  }));

  const details = (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {single ? (
        <div className="flex flex-col gap-0.5">
          <p className="line-clamp-2 text-lg leading-tight font-extrabold text-text-primary">
            {lead.cardName}
          </p>
          <p className="text-sm text-text-secondary">{lead.cardNumber}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          <p className="line-clamp-2 text-lg leading-tight font-extrabold text-text-primary">
            {item.deckLabel ?? `${item.total} cards`}
          </p>
          <p className="text-sm text-text-secondary">
            {item.deckLabel ? `${item.total} cards` : "One hunt"}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">{chips}</div>

      {single && lead.match && (
        <p className="text-sm font-semibold text-accent">
          {lead.match === "exact" ? "You have this" : "You have another printing"}
        </p>
      )}
      {single && lead.state === "found" ? (
        <p className="text-sm font-semibold text-accent">Found</p>
      ) : single && lead.youOffered ? (
        <p className="text-sm text-text-secondary">You said you have this</p>
      ) : single && lead.state === "offered" ? (
        <p className="text-sm text-text-secondary">Somebody offered</p>
      ) : null}
      {!single && item.youCanAnswer > 0 && (
        <p className="text-sm font-semibold text-accent">
          You can answer {item.youCanAnswer} of {item.total}
        </p>
      )}

      {/* What they wrote with it, in the quiet colour. Nothing at all
          when they wrote nothing: no empty row. */}
      {item.note && (
        <p className="text-sm leading-relaxed text-text-secondary">
          &ldquo;{item.note}&rdquo;
        </p>
      )}
    </div>
  );

  return (
    <article className="flex flex-col gap-3 rounded-[20px] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
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
              {item.yours && (
                <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-text-muted uppercase">
                  Your Flare
                </span>
              )}
            </span>
            <FlareStatus
              label={item.total === 1 ? "is hunting" : `is hunting ${item.total} cards`}
            />
          </span>
        </Link>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-[13px] text-text-muted">
          <span>{agoFrom(item.postedAt)}</span>
          {typeof item.milesAway === "number" && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden="true" />
              {awayLabel(item.milesAway)}
            </span>
          )}
        </div>
      </div>

      {/* The card, big, with its details beside it. A deck keeps its
          rail across the width and the details underneath. */}
      {single ? (
        <div className="flex items-start gap-3.5">
          <FeedTile
            imageUrl={lead.imageUrl}
            name={lead.cardName}
            cardNumber={lead.cardNumber}
            match={lead.match}
            size="lg"
            state={lead.state}
            have={haveFor(lead, post)}
          />
          {details}
        </div>
      ) : (
        <FlareDeckPager
          cards={item.cards}
          total={item.total}
          chips={chips}
          note={item.note}
          tiles={item.cards.map((card, index) => (
            <FeedTile
              key={card.cardId}
              imageUrl={card.imageUrl}
              name={card.cardName}
              cardNumber={card.cardNumber}
              match={card.match}
              size="pager"
              state={card.state}
              have={haveFor(card, post)}
              siblings={shelf}
              position={index}
            />
          ))}
        />
      )}

      {/* A hairline, then the counts. Understated until touched. */}
      <div className="border-t border-border pt-3">
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
      </div>

      {/* Every post that HAS a place ends in one. */}
      {item.code && item.storeName ? (
        <Link href={`/e/${item.code}`} className={buttonStyles("secondary", "sm")}>
          Go to {item.storeName}
        </Link>
      ) : null}
    </article>
  );
}
