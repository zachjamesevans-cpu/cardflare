"use client";

import { useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight } from "lucide-react";

import { cn } from "@/lib/cn";
import type { FeedCard } from "@/lib/feed/repository";

/**
 * A deck on the Feed: the founder's second concept render.
 *
 * An inset panel holds a pager with the hero card centred and its
 * neighbours peeking either side, the active card's name and number
 * beside it, dots under the hero, a "1/4" pill in the corner, a swipe
 * hint, and a strip of thumbnails that jump the pager. The tiles are
 * rendered by the server (FeedTile, with the zoom and "I have this"
 * inside) and handed over as children; this only tracks which one is
 * in the middle. The app draws the same panel natively.
 */

/** The hero's width and the gap between cards, in pixels: `w-28`. */
const HERO = 112;
const GAP = 10;
const PAGE = HERO + GAP;

export function FlareDeckPager({
  cards,
  total,
  tiles,
  chips,
  note,
}: {
  cards: FeedCard[];
  total: number;
  /** One FeedTile per card, in the same order. */
  tiles: ReactNode[];
  chips: ReactNode;
  note: string | null;
}) {
  const [at, setAt] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const active = cards[at] ?? cards[0];

  const jump = (index: number) => {
    setAt(index);
    scroller.current?.scrollTo({ left: index * PAGE, behavior: "smooth" });
  };

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-black/35 p-3">
      <div className="flex items-start gap-2">
        <div className="flex w-[56%] shrink-0 flex-col gap-2">
          <div
            ref={scroller}
            onScroll={(event) => {
              const landed = Math.round(event.currentTarget.scrollLeft / PAGE);
              if (landed !== at && landed >= 0 && landed < cards.length) setAt(landed);
            }}
            className="flex snap-x snap-mandatory [scrollbar-width:none] items-center gap-[10px] overflow-x-auto py-2 [&::-webkit-scrollbar]:hidden"
          >
            {/* Spacers, so the first and last card can sit centred with
                a neighbour showing beside them. */}
            <span
              aria-hidden="true"
              className="shrink-0"
              style={{ width: "calc(50% - 56px)" }}
            />
            {tiles.map((tile, index) => (
              <div
                key={cards[index]?.cardId ?? index}
                className={cn(
                  "shrink-0 snap-center transition-[opacity,transform] duration-200",
                  index === at
                    ? "opacity-100 drop-shadow-[0_0_10px_rgba(198,238,79,0.45)]"
                    : "scale-[0.92] opacity-45",
                )}
              >
                {tile}
              </div>
            ))}
            <span
              aria-hidden="true"
              className="shrink-0"
              style={{ width: "calc(50% - 56px)" }}
            />
          </div>
          <div className="flex justify-center gap-2" aria-hidden="true">
            {cards.map((card, index) => (
              <span
                key={card.cardId}
                className={cn(
                  "size-2 rounded-full",
                  index === at ? "bg-accent" : "bg-border-strong",
                )}
              />
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
          <span className="self-end rounded-full border border-border-strong bg-surface px-2.5 py-0.5 text-xs font-bold text-text-primary tabular-nums">
            {at + 1}/{cards.length}
          </span>
          {active && (
            <div className="flex flex-col gap-0.5">
              <p className="line-clamp-2 text-[17px] leading-tight font-extrabold text-text-primary">
                {active.cardName}
              </p>
              <p className="text-[13px] text-text-secondary">{active.cardNumber}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">{chips}</div>
          {active?.match && (
            <p className="text-[13px] font-semibold text-accent">
              {active.match === "exact" ? "You have this" : "You have another printing"}
            </p>
          )}
          {active?.state === "found" ? (
            <p className="text-[13px] font-semibold text-accent">Found</p>
          ) : active?.youOffered ? (
            <p className="text-[13px] text-text-secondary">You said you have this</p>
          ) : active?.state === "offered" ? (
            <p className="text-[13px] text-text-secondary">Somebody offered</p>
          ) : null}
          {note && (
            <p className="text-sm leading-relaxed text-text-secondary">
              &ldquo;{note}&rdquo;
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-border" />
      <p className="flex items-center justify-end gap-1.5 text-xs text-text-muted italic">
        <ArrowLeftRight className="size-3.5" aria-hidden="true" />
        Swipe to browse all {total} cards
      </p>

      {/* The strip: every card small, the active one lit. Click to jump. */}
      <div className="flex [scrollbar-width:none] gap-2 overflow-x-auto py-0.5 [&::-webkit-scrollbar]:hidden">
        {cards.map((card, index) => (
          <button
            key={card.cardId}
            type="button"
            onClick={() => jump(index)}
            aria-label={`Show ${card.cardName}`}
            aria-pressed={index === at}
            className={cn(
              "block h-[84px] w-[60px] shrink-0 cursor-pointer overflow-hidden rounded-lg border bg-elevated transition-[opacity,box-shadow]",
              index === at
                ? "border-2 border-accent opacity-100 shadow-[0_0_8px_rgba(198,238,79,0.5)]"
                : "border-border opacity-80 hover:opacity-100",
            )}
          >
            {card.imageUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={card.imageUrl} alt="" className="size-full object-cover" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
