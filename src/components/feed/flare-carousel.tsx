"use client";

import { useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/cn";
import type { FeedCard } from "@/lib/feed/repository";

/**
 * A post's cards, one slide at a time.
 *
 * Each slide is the card's picture beside what matters about it: the
 * name, how many are still wanted (or on offer), and which printing.
 * The next slide peeks in from the right so a reader knows there is
 * more; a swipe, the arrows or the keyboard move along. The tiles are
 * rendered by the server (FeedTile, with the zoom inside) and handed
 * over as children; this only tracks which one is in view. The app
 * draws the same slides natively.
 */

/** "Need 2 more", "2 available", "Found": the one line under a name. */
export function cardCountLabel(card: FeedCard, direction: "want" | "showcase"): string {
  const quantity = card.quantity ?? 1;
  if (direction === "showcase") {
    return `${quantity} available`;
  }
  const remaining = card.remaining ?? quantity;
  if (card.state === "found" || remaining === 0) return "Found";
  return `Need ${remaining} more`;
}

export function FlareCarousel({
  cards,
  direction,
  tiles,
}: {
  cards: FeedCard[];
  direction: "want" | "showcase";
  /** One FeedTile per card, in the same order. */
  tiles: ReactNode[];
}) {
  const [at, setAt] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  const jump = (index: number) => {
    const clamped = Math.max(0, Math.min(cards.length - 1, index));
    setAt(clamped);
    const slide = scroller.current?.children[clamped] as HTMLElement | undefined;
    scroller.current?.scrollTo({ left: slide?.offsetLeft ?? 0, behavior: "smooth" });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <div
          ref={scroller}
          onScroll={(event) => {
            const first = event.currentTarget.children[0] as HTMLElement | undefined;
            const second = event.currentTarget.children[1] as HTMLElement | undefined;
            const page = second && first ? second.offsetLeft - first.offsetLeft : 0;
            if (page <= 0) return;
            const landed = Math.round(event.currentTarget.scrollLeft / page);
            if (landed !== at && landed >= 0 && landed < cards.length) setAt(landed);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              event.preventDefault();
              jump(at + 1);
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              jump(at - 1);
            }
          }}
          tabIndex={0}
          aria-roledescription="carousel"
          aria-label={`${cards.length} cards`}
          className="flex snap-x snap-mandatory [scrollbar-width:none] gap-2.5 overflow-x-auto rounded-[var(--radius-control)] py-0.5 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none [&::-webkit-scrollbar]:hidden"
        >
          {cards.map((card, index) => (
            <div
              key={card.cardId}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${cards.length}: ${card.cardName}`}
              className={cn(
                "flex w-[86%] shrink-0 snap-start items-center gap-3 rounded-[var(--radius-control)] border bg-elevated/60 p-2.5 transition-colors sm:w-[70%]",
                index === at ? "border-border-strong" : "border-border",
              )}
            >
              {tiles[index]}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="line-clamp-2 text-base leading-tight font-extrabold text-text-primary">
                  {card.cardName}
                </p>
                <p className="text-xs text-text-secondary">{card.cardNumber}</p>
                <p className="mt-0.5 text-sm font-semibold text-accent tabular-nums">
                  {cardCountLabel(card, direction)}
                </p>
                <p className="truncate text-xs text-text-muted">
                  {card.printingLabel ?? "Any printing"}
                </p>
                {card.match && (
                  <p className="text-xs font-semibold text-accent">
                    {card.match === "exact"
                      ? "You have this"
                      : "You have another printing"}
                  </p>
                )}
                {card.youOffered ? (
                  <p className="text-xs text-text-secondary">You said you have this</p>
                ) : card.state === "offered" ? (
                  <p className="text-xs text-text-secondary">Somebody offered</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {/* The arrows, for a pointer and a keyboard. A thumb swipes. */}
        <button
          type="button"
          onClick={() => jump(at - 1)}
          disabled={at === 0}
          aria-label="Previous card"
          className="absolute top-1/2 left-1 hidden size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-border bg-surface/90 text-text-primary shadow-[var(--shadow-card)] transition-opacity hover:border-border-strong disabled:opacity-0 sm:flex"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => jump(at + 1)}
          disabled={at >= cards.length - 1}
          aria-label="Next card"
          className="absolute top-1/2 right-1 hidden size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-border bg-surface/90 text-text-primary shadow-[var(--shadow-card)] transition-opacity hover:border-border-strong disabled:opacity-0 sm:flex"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex gap-1.5" aria-hidden="true">
          {cards.map((card, index) => (
            <button
              key={card.cardId}
              type="button"
              tabIndex={-1}
              onClick={() => jump(index)}
              className={cn(
                "size-2 cursor-pointer rounded-full transition-colors",
                index === at ? "bg-accent" : "bg-border-strong",
              )}
            />
          ))}
        </div>
        <span className="text-xs font-semibold text-text-muted tabular-nums">
          {at + 1} / {cards.length}
        </span>
      </div>
    </div>
  );
}
