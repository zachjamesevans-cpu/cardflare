import Link from "next/link";
import { CalendarClock, PackageCheck, Layers } from "lucide-react";

import { PlayerAvatar } from "@/components/players/player-avatar";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import type { FeedItem } from "@/lib/feed/repository";

/**
 * What one item of the Feed looks like.
 *
 * Split out of the page so the presentation can be rendered from fixtures
 * without a database behind it — this is a screen judged by eye, and a
 * screen judged by eye has to be lookable-at before it ships.
 */

/**
 * When the doors open, in the store's own clock.
 *
 * A board days out needs a day and an hour and nothing else. The room's
 * formatter says "open since", which is true of an event underway and wrong
 * about every board this line is drawn for.
 */
function doorsAt(startsAt: string | null, timeZone: string): string {
  if (!startsAt) return "Taking Flares early";

  return `Doors ${new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(startsAt))}`;
}

/** One card, at the size the feed shows cards. */
function FeedTile({
  imageUrl,
  name,
  match,
}: {
  imageUrl: string | null;
  name: string;
  match: "exact" | "other-printing";
}) {
  return (
    <span
      title={match === "exact" ? `You have ${name}` : `You have another printing`}
      /* The board's own mark for a card you are holding, so the feed and
         the room are not two dialects of the same fact. */
      className="relative block w-14 shrink-0 overflow-hidden rounded-[6px] border border-border bg-elevated shadow-[0_0_10px_rgba(198,238,79,0.35)] ring-2 ring-accent"
    >
      <span className="block aspect-[60/84] w-full">
        {imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={imageUrl} alt="" className="size-full object-cover" />
        )}
      </span>
      <span className="pointer-events-none absolute top-0.5 left-0.5 rounded-full bg-surface/90 p-0.5">
        {match === "exact" ? (
          <PackageCheck className="size-3 text-accent" aria-hidden="true" />
        ) : (
          <Layers className="size-3 text-accent" aria-hidden="true" />
        )}
      </span>
    </span>
  );
}

export function Item({ item }: { item: FeedItem }) {
  if (item.kind === "hunt") {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <PlayerAvatar
            displayName={item.displayName}
            seed={item.playerId}
            avatarUrl={item.avatarUrl}
            frame={item.frame}
            ring={item.ring}
            size="md"
          />
          <div className="flex min-w-0 flex-col">
            <p className="truncate font-semibold text-text-primary">
              {item.displayName}
            </p>
            <p className="truncate text-xs text-text-muted">
              is hunting · {item.eventName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <FeedTile
            imageUrl={item.card.imageUrl}
            name={item.card.cardName}
            match={item.card.match}
          />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="truncate font-semibold text-text-primary">
              {item.card.cardName}
            </p>
            <p className="font-mono text-xs text-text-muted">{item.card.cardNumber}</p>
            <p className="text-sm font-medium text-accent">
              {item.card.match === "exact"
                ? "You have this"
                : "You have another printing"}
            </p>
          </div>
        </div>

        {/* Every item ends in a place and a time. */}
        <Link href={`/e/${item.code}`} className={buttonStyles("primary", "sm")}>
          Go to {item.storeName}
        </Link>
      </Card>
    );
  }

  if (item.kind === "traded") {
    return (
      <Card className="flex items-center gap-3 p-4">
        {item.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={item.imageUrl}
            alt=""
            className="w-9 shrink-0 rounded-[4px] border border-border"
          />
        )}
        <p className="min-w-0 flex-1 text-sm text-text-secondary">
          <span className="font-semibold text-text-primary">{item.requester}</span>
          {" traded for "}
          <span className="font-semibold text-text-primary">{item.cardName}</span>
          {item.holder ? (
            <>
              {" with "}
              <span className="font-semibold text-text-primary">{item.holder}</span>
            </>
          ) : null}
          {` at ${item.storeName}.`}
        </p>
      </Card>
    );
  }

  if (item.kind === "added") {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <PlayerAvatar
            displayName={item.displayName}
            seed={item.playerId}
            avatarUrl={item.avatarUrl}
            frame={item.frame}
            ring={item.ring}
            size="md"
          />
          <div className="flex min-w-0 flex-col">
            <p className="truncate font-semibold text-text-primary">
              {item.displayName}
            </p>
            <p className="text-xs text-text-muted">
              added {item.total} {item.total === 1 ? "card" : "cards"} to their binder
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {item.cards.map((card) => (
            <span
              key={card.cardId}
              title={card.cardName}
              /* Ringed only when it is on YOUR list — the same green the
                 board uses, for the same "this one concerns you". */
              className={`block w-14 shrink-0 overflow-hidden rounded-[6px] border border-border bg-elevated ${
                card.onYourList
                  ? "shadow-[0_0_10px_rgba(198,238,79,0.35)] ring-2 ring-accent"
                  : ""
              }`}
            >
              <span className="block aspect-[60/84] w-full">
                {card.imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={card.imageUrl} alt="" className="size-full object-cover" />
                )}
              </span>
            </span>
          ))}
        </div>

        {item.onYourListCount > 0 && (
          <p className="text-sm font-medium text-accent">
            {item.onYourListCount === 1
              ? "One of these is on your want list"
              : `${item.onYourListCount} of these are on your want list`}
          </p>
        )}
      </Card>
    );
  }

  if (item.kind === "suggest") {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-0.5">
          <p className="font-semibold text-text-primary">Worth following</p>
          <p className="text-xs text-text-muted">
            Their binders answer what you&rsquo;re hunting.
          </p>
        </div>

        {item.players.map((person) => (
          <div key={person.playerId} className="flex items-center gap-3">
            <PlayerAvatar
              displayName={person.displayName}
              seed={person.playerId}
              avatarUrl={person.avatarUrl}
              frame={null}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text-primary">
                {person.displayName}
              </p>
              <p className="text-xs text-text-muted">
                {/* Always "wants": the list is plural even when the
                    overlap with it is one card. */}
                has {person.answers} of your wants
              </p>
            </div>
            <Link
              href={`/p/${person.playerId}`}
              className={buttonStyles("secondary", "sm")}
            >
              View
            </Link>
          </div>
        ))}
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-accent">{item.storeName}</p>
        <p className="text-lg font-semibold text-text-primary">{item.eventName}</p>
        {/*
         * "Open now", not "Trading now": a walk-in room is itself called
         * Trading now, and the heading directly above would have said it
         * twice. And a board that has not opened yet is never "open
         * since" — the room's own formatter assumes an event underway,
         * which is exactly what an early board is not.
         */}
        <p className="flex items-center gap-1.5 text-sm text-text-secondary">
          <CalendarClock className="size-4 shrink-0 text-text-muted" aria-hidden />
          {item.live ? "Open now" : doorsAt(item.startsAt, item.timeZone)}
        </p>
      </div>

      {item.youCanAnswer > 0 && (
        <>
          <p className="text-sm font-medium text-accent">
            You can answer {item.youCanAnswer}{" "}
            {item.youCanAnswer === 1 ? "card" : "cards"} on this board
          </p>
          <div className="flex gap-2">
            {item.sample.map((card) => (
              <FeedTile
                key={card.cardId}
                imageUrl={card.imageUrl}
                name={card.cardName}
                match={card.match}
              />
            ))}
          </div>
        </>
      )}

      <Link href={`/e/${item.code}`} className={buttonStyles("secondary", "sm")}>
        {item.live ? "Go to the room" : "See the board"}
      </Link>
    </Card>
  );
}
