import Link from "next/link";
import { CalendarClock, Megaphone, Store as StoreIcon, Users } from "lucide-react";

import { agoFrom } from "@/components/feed/flare-feed-card";
import { PostSocial } from "@/components/feed/post-social";
import { VerifiedMark } from "@/components/stores/verified-mark";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { rsvpAction } from "@/lib/players/account-actions";
import type { StorePostItem } from "@/lib/feed/repository";

/**
 * A store's post on the Feed, drawn as the post a Flare is.
 *
 * The founder: "a store announcing 'OP-12 prerelease Saturday, 20
 * seats' as a Flare-shaped post to its followers. This is the thing
 * that makes following worth it." So it takes the Flare card's shape
 * exactly: the logo where the face goes, the store's name with its
 * Verified mark, "posted an update" in the accent where a Flare says
 * "is looking for", the time on the right. Then the picture when there is
 * one, the title, the words, and when the post is about an event
 * night, "I'll be there" with how many already are. The heart and the
 * thread are the same ones every post has. The app draws the same
 * card natively (mobile/src/store-post-card.tsx).
 */

/** "Opens Friday, Oct 3, 7:00 PM", in the store's own clock. */
export function opensAtLabel(iso: string, timeZone: string): string {
  return `Opens ${new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso))}`;
}

/** "Saturday, Oct 4 · 12:00 PM": when the night is. */
export function eventDateLabel(iso: string, timeZone: string): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);
  return `${day} · ${time}`;
}

export function goingLabel(count: number): string {
  return `${count} going`;
}

export function StorePostCard({ item }: { item: StorePostItem }) {
  return (
    <article className="flex flex-col gap-2.5 rounded-[20px] border border-border bg-surface p-3 shadow-[var(--shadow-card)]">
      {/* The header: logo, name with its mark, the status line; time on
          the right. The same row a Flare has, with a shop in it. */}
      <div className="flex items-start gap-3">
        <Link
          href={`/s/${item.storeId}`}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[var(--radius-control)] transition-colors hover:bg-elevated/60"
        >
          <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-elevated">
            {item.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.logoUrl}
                alt=""
                className="size-full object-cover"
                width={44}
                height={44}
              />
            ) : (
              <StoreIcon className="size-5 text-text-muted" aria-hidden="true" />
            )}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-base font-extrabold text-text-primary">
                {item.storeName}
              </span>
              {item.verified && <VerifiedMark className="size-4" />}
            </span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-accent">
              <Megaphone
                className="size-[17px] shrink-0"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              posted an update
            </span>
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-1 text-[13px] text-text-muted">
          <span>{agoFrom(item.postedAt)}</span>
        </div>
      </div>

      {/* The picture, wide, when there is one. */}
      {item.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
          alt=""
          className="aspect-video w-full rounded-[14px] border border-border object-cover"
          loading="lazy"
        />
      )}

      <div className="flex flex-col gap-1">
        <h3 className="text-base leading-snug font-bold text-text-primary">
          {item.title}
        </h3>
        {item.body && (
          <p className="text-sm leading-relaxed whitespace-pre-line text-text-secondary">
            {item.body}
          </p>
        )}
      </div>

      {/* The event night it is about: "I'll be there" while the board is
          taking Flares, and when it will be until then. */}
      {item.event && (
        <div className="flex flex-col gap-2 rounded-[14px] border border-border bg-elevated/60 p-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="truncate text-sm font-semibold text-text-primary">
              {item.event.name}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-text-secondary">
              <CalendarClock
                className="size-3.5 shrink-0 text-text-muted"
                aria-hidden
              />
              {eventDateLabel(item.event.startsAt, item.event.timeZone)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {item.event.open ? (
              <form action={rsvpAction}>
                <input type="hidden" name="code" value={item.event.code} />
                <button
                  type="submit"
                  disabled={item.going}
                  className={cn(buttonStyles("primary", "sm"), "cursor-pointer")}
                >
                  {item.going ? "Going" : "I'll be there"}
                </button>
              </form>
            ) : (
              <span className="text-sm font-medium text-text-secondary">
                {opensAtLabel(item.event.opensAt, item.event.timeZone)}
              </span>
            )}
            <span className="flex items-center gap-1.5 text-sm text-text-secondary tabular-nums">
              <Users className="size-4 text-text-muted" aria-hidden="true" />
              {goingLabel(item.event.playersIn)}
            </span>
          </div>
        </div>
      )}

      <PostSocial
        postId={item.postId}
        likes={item.likes}
        liked={item.liked}
        comments={item.comments}
      />
    </article>
  );
}
