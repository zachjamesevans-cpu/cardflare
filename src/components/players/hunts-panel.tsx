"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Crosshair, Folder, FolderOpen } from "lucide-react";

import { FeedTile } from "@/components/feed/feed-tile";
import { buttonStyles } from "@/components/ui/button";
import type { ZoomCard } from "@/components/cards/card-image-zoom";
import type { Hunt } from "@/lib/players/hunts";

/**
 * Somebody's hunts, on their profile.
 *
 * A HUNT IS A FOLDER, and it opens. The founder: "hunts doesn't really
 * do anything rn. look at it. think of the carousel we were using
 * previously. this should be a carousel of cards someone is looking for
 * nested into a folder. go to my profile. there's nothing i can tap or
 * add to."
 *
 * Right on every count. It was a name and two numbers - a receipt for
 * cards you could not see, on a panel with nothing to press. The row is
 * a lid now: open it and the cards are underneath, drawn by the same
 * `FeedTile` the Feed's rails use, so they zoom and page exactly like
 * every other card on the site. Nothing new was invented to show them.
 *
 * The two numbers stay, because they are the thing worth reading at a
 * glance: what is left says whether you can help. They just summarise
 * something visible now instead of standing in for it.
 *
 * NOTHING IS CHECKED OFF BY HAND. A card moves from looking to found
 * when the trade that got it is confirmed, which is the one moment we
 * can be sure actually happened. A tick box would be a second thing to
 * keep in step with the first.
 */
export function HuntsPanel({
  hunts,
  limit,
  yours,
}: {
  hunts: Hunt[];
  /** How many they may keep, when it is worth saying. */
  limit?: number;
  yours?: boolean;
}) {
  /*
   * At most one open. A profile with five hunts open is five rails and
   * a scroll, which is the wall of cards the folders exist to avoid.
   * The first opens itself, so the panel is never a row of closed lids
   * with nothing to look at.
   */
  const [open, setOpen] = useState<string | null>(hunts[0]?.name ?? null);

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 font-semibold text-text-primary">
          <Crosshair className="size-4 text-accent" aria-hidden="true" />
          Hunts
        </p>
        {limit ? (
          <p className="text-xs text-text-muted tabular-nums">
            {hunts.length} of {limit}
          </p>
        ) : null}
      </div>

      {hunts.length === 0 ? (
        <>
          <p className="text-sm text-text-secondary">
            {yours
              ? "Name a group when you post and every card you add joins it. The set shows up here, with what is left and what you have found."
              : "No hunts yet."}
          </p>
          {/* Somewhere to press. An empty panel that only explains what
              would happen is the thing the founder was looking at. */}
          {yours ? (
            <Link href="/flare" className={buttonStyles("secondary", "sm")}>
              Start a hunt
            </Link>
          ) : null}
        </>
      ) : (
        <ul className="flex flex-col gap-2">
          {hunts.map((hunt) => (
            <HuntFolder
              key={hunt.name}
              hunt={hunt}
              open={open === hunt.name}
              onToggle={() => setOpen(open === hunt.name ? null : hunt.name)}
              yours={yours}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function HuntFolder({
  hunt,
  open,
  onToggle,
  yours,
}: {
  hunt: Hunt;
  open: boolean;
  onToggle: () => void;
  yours?: boolean;
}) {
  const cards = hunt.cards ?? [];

  /* The shelf the zoom pages along, so opening one card lets you swipe
     the whole folder - the same shelf a Flare's deck hands its tiles. */
  const shelf: ZoomCard[] = cards.map((card) => ({
    imageUrl: card.imageUrl,
    exactName: card.cardName,
    cardNumber: card.cardNumber,
    youHave: null,
    have: null,
  }));

  return (
    <li
      className={`overflow-hidden rounded-[var(--radius-control)] border bg-elevated ${
        open ? "border-accent" : "border-border"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface/60"
      >
        <span className="flex min-w-0 items-center gap-2">
          {open ? (
            <FolderOpen className="size-4 shrink-0 text-accent" aria-hidden="true" />
          ) : (
            <Folder className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
          )}
          <span className="truncate font-semibold text-text-primary">{hunt.name}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
          {hunt.looking > 0 ? (
            <span className="text-accent">{lookingLabel(hunt)}</span>
          ) : (
            <span className="text-text-muted">All found</span>
          )}
          {hunt.found > 0 ? (
            <span className="text-text-muted">· {hunt.found} found</span>
          ) : null}
          <ChevronDown
            className={`size-3.5 text-text-muted transition-transform ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </span>
      </button>

      {open ? (
        <div className="flex flex-col gap-3 px-3 pb-3">
          {cards.length > 0 ? (
            /* Scrolls inside itself: a long hunt must never make the
               page scroll sideways. */
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">
              {cards.map((card, index) => (
                <FeedTile
                  key={card.cardId}
                  imageUrl={card.imageUrl}
                  name={card.cardName}
                  cardNumber={card.cardNumber}
                  match={null}
                  size="pager"
                  /* Found reads as found: the same dimming a traded card
                     wears on a Flare, so one visual vocabulary covers
                     both. */
                  state={card.found ? "found" : "open"}
                  siblings={shelf}
                  position={index}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-muted">Nothing to show yet.</p>
          )}
          {yours ? (
            <Link
              /* Into the composer with the folder already named, so this
                 adds to THIS hunt rather than starting a fresh one that
                 happens to share a name. */
              href={`/flare?hunt=${encodeURIComponent(hunt.name)}`}
              className={buttonStyles("secondary", "sm")}
            >
              Add cards
            </Link>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * "3 left", or "3 left (5 copies)" when somebody wants more than one of
 * something. The copies only appear when they differ from the card
 * count, because "3 left (3 copies)" is the same fact twice.
 */
export function lookingLabel(hunt: Hunt): string {
  if (hunt.lookingCopies > hunt.looking) {
    return `${hunt.looking} left · ${hunt.lookingCopies} copies`;
  }
  return `${hunt.looking} left`;
}
