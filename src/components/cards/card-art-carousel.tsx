"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { CardArt } from "@/lib/cards/card-arts";
import { cn } from "@/lib/cn";

/** Said between the carousel and the prices panel, both ways. */
export const ART_EVENT = "cf-card-art";
export const VARIANT_EVENT = "cf-card-variant";

/** The variants of the art on show now, for a prices panel that mounts
    after the carousel said so (it streams in later). */
export let shownArtVariants: string[] | null = null;
/** The printing a Flare from here names: the art on show's first. */
export let shownArtPrinting: string | null = null;
/** Every printing of the art on show, for "On your Flares". */
export let shownArtPrintingIds: string[] | null = null;

/**
 * A card's artworks, swiped one at a time (src/lib/cards/card-arts.ts):
 * the founder, "for alt arts, you should be able to swipe between them
 * like a carousel ... for all tcg's". Scroll-snap does the swipe on a
 * phone; arrows and the keyboard do it on a desk. Under it, the art's
 * name and a dot per art. The prices panel follows the art on show and a
 * price chip slides the carousel to its art (two window events, so the
 * two islands need no shared parent). The app's card sheet is the same.
 */
export function CardArtCarousel({ arts, name }: { arts: CardArt[]; name: string }) {
  const rail = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const several = arts.length > 1;

  /* One art and the gap after it, measured: a swipe moves exactly one. */
  const step = () => {
    const el = rail.current;
    const first = el?.children[0] as HTMLElement | undefined;
    const second = el?.children[1] as HTMLElement | undefined;
    return first && second
      ? second.offsetLeft - first.offsetLeft
      : (el?.clientWidth ?? 1);
  };

  const go = (index: number) => {
    const next = Math.max(0, Math.min(arts.length - 1, index));
    rail.current?.scrollTo({ left: next * step(), behavior: "smooth" });
  };

  /* Tell the prices which art is on show. */
  useEffect(() => {
    shownArtVariants = arts[at]?.variants ?? null;
    shownArtPrinting = arts[at]?.printingIds[0] ?? null;
    shownArtPrintingIds = arts[at]?.printingIds ?? null;
    window.dispatchEvent(
      new CustomEvent(ART_EVENT, { detail: arts[at]?.variants ?? [] }),
    );
  }, [at, arts]);

  /* A price chip picked a printing: slide to its art. */
  useEffect(() => {
    const onVariant = (event: Event) => {
      const variant = (event as CustomEvent<string>).detail;
      const index = arts.findIndex((art) => art.variants.includes(variant));
      if (index >= 0) go(index);
    };
    window.addEventListener(VARIANT_EVENT, onVariant);
    return () => window.removeEventListener(VARIANT_EVENT, onVariant);
  });

  if (arts.length === 0) {
    return (
      <span className="block h-[20.5rem] w-60 rounded-[10px] border border-border bg-elevated" />
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="@container relative w-full">
        <div
          ref={rail}
          tabIndex={several ? 0 : -1}
          aria-label={
            several ? `${name}: ${arts.length} arts, swipe or use the arrow keys` : name
          }
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") go(at + 1);
            if (event.key === "ArrowLeft") go(at - 1);
          }}
          onScroll={(event) => {
            const el = event.currentTarget;
            const index = Math.round(el.scrollLeft / step());
            if (index !== at) setAt(index);
          }}
          /* The art on show centred, the next one peeking in at the right
             (the founder: "you'll see the card on the right loaded, then
             you can swipe into the alt arts"). */
          className="flex snap-x snap-mandatory [scrollbar-width:none] gap-3.5 overflow-x-auto px-[calc(50cqw-min(7.5rem,32cqw))] [&::-webkit-scrollbar]:hidden"
        >
          {arts.map((art, index) => (
            <div
              key={art.imageUrl}
              className={cn(
                "w-[min(15rem,64cqw)] shrink-0 snap-center transition-[transform,opacity] duration-300",
                index === at ? "scale-100 opacity-100" : "scale-[0.88] opacity-60",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={art.imageUrl}
                alt={`${name}, ${art.label}`}
                className="h-auto w-full rounded-[10px] border border-border bg-elevated"
              />
            </div>
          ))}
        </div>
        {several && (
          <>
            <ArtArrow side="left" hidden={at === 0} onClick={() => go(at - 1)} />
            <ArtArrow
              side="right"
              hidden={at === arts.length - 1}
              onClick={() => go(at + 1)}
            />
          </>
        )}
      </div>
      {several && (
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-sm font-semibold text-text-secondary">{arts[at]?.label}</p>
          <div className="flex gap-1.5">
            {arts.map((art, index) => (
              <button
                key={art.imageUrl}
                type="button"
                aria-label={`Show ${art.label}`}
                onClick={() => go(index)}
                className={cn(
                  "h-1.5 cursor-pointer rounded-full transition-all",
                  index === at ? "w-4 bg-accent" : "w-1.5 bg-border-strong",
                )}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ArtArrow({
  side,
  hidden,
  onClick,
}: {
  side: "left" | "right";
  hidden: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={side === "left" ? "Previous art" : "Next art"}
      onClick={onClick}
      disabled={hidden}
      className={cn(
        "absolute top-1/2 hidden size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-border bg-surface/90 text-text-primary transition-opacity hover:border-border-strong disabled:opacity-0 sm:flex",
        side === "left" ? "left-1" : "right-1",
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}
