"use client";

import { useLayoutEffect, useRef, useState } from "react";

import type { DisplayFlare } from "@/lib/event-hub/display-payload";

/**
 * The Flare board, one card at a time — FOCUS mode's right-hand side.
 *
 * The founder's diagnosis of the old board: "the card artwork and
 * information are difficult to see from across the store... If content
 * does not fit: SHOW LESS CONTENT. ROTATE IT." So instead of six
 * thumbnails in a strip along the bottom, a dedicated screen shows ONE
 * card at a time, as tall as the column allows, with the ask written
 * underneath in text sized for the back of a shop. Every few windows
 * the rotation shows a small overview — every active card at a glance,
 * with a count — then returns to featuring them one by one.
 *
 * The rotation itself rides the display's single rotation tick; this
 * component decides only what a given tick means. With N flares the
 * sequence is N featured frames then one overview, so everything is
 * seen close-up once per cycle and the overview stays periodic rather
 * than constant.
 */

export function FeaturedFlare({
  flares,
  tick,
}: {
  flares: DisplayFlare[];
  tick: number;
}) {
  if (flares.length === 0) return <EmptyFeatured />;

  /* One flare never needs an overview of itself. */
  const cycle = flares.length > 1 ? flares.length + 1 : 1;
  const position = tick % cycle;
  const overview = flares.length > 1 && position === flares.length;

  return (
    <section
      className="flex h-full min-h-0 flex-col gap-[clamp(0.4rem,0.8vw,1rem)] rounded-[var(--radius-panel)] border-2 border-border bg-surface p-[clamp(0.75rem,1.5vw,2rem)]"
      aria-label="Wanted in the room"
    >
      {/* Centred over the card it labels. The indent matches the
          tracking, which trails a space after the last letter and would
          otherwise sit the line a hair left of the card's centre. */}
      <p className="shrink-0 text-center indent-[0.18em] text-[clamp(0.8rem,1.3vw,1.5rem)] font-bold tracking-[0.18em] text-accent uppercase">
        Wanted in the room
      </p>

      <div
        key={position === flares.length ? "overview" : flares[position].cardId}
        className="flex min-h-0 flex-1 flex-col motion-safe:animate-[cf-flare-in_var(--duration-slow)_var(--ease-out-soft)]"
      >
        {overview ? (
          <Overview flares={flares} />
        ) : (
          <FeaturedCard flare={flares[position]} />
        )}
      </div>
    </section>
  );
}

/**
 * One card, as large as the column allows, with the ask under it.
 * Exported because the Auto Mode intermission features the same card at
 * even larger sizes — one renderer, so the two can never drift.
 */
export function FeaturedCard({ flare }: { flare: DisplayFlare }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-[clamp(0.4rem,0.9vw,1.1rem)]">
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {/*
         * The picture sets the box. It used to sit inside an aspect-ratio
         * wrapper sized from a percentage height, which Safari on a phone
         * resolved as the full panel width: the art drew at its own width
         * and the rest of the box showed as a grey block beside it. The
         * founder: "There's a weird gray block on mobile in the card
         * section." A replaced element with a height and an auto width
         * computes its width from the art itself in every browser, so
         * the box is exactly the card and centres as one.
         */}
        <span className="relative block h-full max-h-full w-auto overflow-hidden rounded-[12px] border border-border shadow-[0_10px_40px_-18px_rgba(0,0,0,0.8)]">
          {flare.imageUrl ? (
            /* Plain img on purpose — immutable, CDN-cached art. */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={flare.imageUrl}
              alt=""
              decoding="async"
              className="block h-full w-auto max-w-none object-contain"
            />
          ) : (
            <span className="block aspect-[60/84] h-full bg-elevated" />
          )}
          {flare.storeMayHave && (
            <span className="absolute inset-x-0 bottom-0 bg-text-primary py-[0.25em] text-center text-[clamp(0.7rem,1vw,1.2rem)] font-bold tracking-[0.04em] text-accent-contrast">
              Store may have
            </span>
          )}
        </span>
      </div>

      <div className="shrink-0 text-center">
        <p className="text-[clamp(1.1rem,2.2vw,2.6rem)] leading-tight font-bold text-text-primary">
          {flare.cardName}
        </p>
        <p className="font-mono text-[clamp(0.75rem,1.3vw,1.5rem)] text-text-muted">
          {flare.cardNumber}
        </p>
        <p className="mt-[0.2em] text-[clamp(0.85rem,1.6vw,1.9rem)] font-semibold text-accent">
          {askLine(flare)}
        </p>
      </div>
    </div>
  );
}

/** A card's proportions, width over height. */
const CARD_RATIO = 60 / 84;

/**
 * Everything at a glance, between close-ups.
 *
 * The cards are laid out to the SPACE, not to a column count. One
 * column per card was the old rule, and the founder photographed what
 * it did with three Flares in a tall column: three thumbnails in a row
 * across the middle of the panel, with most of the panel empty above
 * and below them. Cards are portrait and the column is portrait, so the
 * arrangement that makes them biggest is two across and as many rows as
 * it takes, each card as large as BOTH the width and the height allow.
 * Measuring the area is the only way to know which of the two is the
 * limit, so the panel is measured and the card size follows.
 */
function Overview({ flares }: { flares: DisplayFlare[] }) {
  const shown = flares.slice(0, 4);
  const more = flares.length - shown.length;
  const area = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const node = area.current;
    if (!node) return;
    const measure = () =>
      setBox({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const columns = Math.min(shown.length, 2);
  const rows = Math.ceil(shown.length / columns);
  /* The gap scales with the area so a 4K wall is not left with hairlines. */
  const gap = Math.round(Math.max(6, box.width * 0.03));
  const byWidth = (box.width - gap * (columns - 1)) / columns;
  const byHeight = ((box.height - gap * (rows - 1)) / rows) * CARD_RATIO;
  const cardWidth = Math.max(0, Math.floor(Math.min(byWidth, byHeight)));

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-[clamp(0.5rem,1vw,1.25rem)]">
      <div
        ref={area}
        className="flex min-h-0 w-full flex-1 flex-wrap content-center items-center justify-center"
        style={{ gap }}
      >
        {shown.map((flare) => (
          <span
            key={flare.cardId}
            className="block overflow-hidden rounded-[8px] border border-border bg-elevated"
            style={{ width: cardWidth }}
          >
            <span className="block aspect-[60/84] w-full">
              {flare.imageUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={flare.imageUrl}
                  alt=""
                  decoding="async"
                  className="size-full object-cover"
                />
              )}
            </span>
          </span>
        ))}
      </div>
      <p className="shrink-0 text-[clamp(0.9rem,1.6vw,1.9rem)] font-bold text-text-primary">
        {flares.length} active {flares.length === 1 ? "Flare" : "Flares"}
        {more > 0 && <span className="text-text-muted"> · {more} more rotating</span>}
      </p>
    </div>
  );
}

/**
 * A dead column is an invitation nobody reads. The empty state says
 * exactly what a player should do about it, and the QR sits directly
 * below in the same column.
 */
function EmptyFeatured() {
  return (
    <section className="flex h-full min-h-0 flex-col items-center justify-center gap-[clamp(0.4rem,0.8vw,1rem)] rounded-[var(--radius-panel)] border-2 border-dashed border-border bg-surface p-[clamp(0.75rem,1.5vw,2rem)] text-center">
      <p className="text-[clamp(1rem,1.9vw,2.2rem)] font-bold tracking-[0.14em] text-text-primary uppercase">
        No active Flares yet
      </p>
      <p className="max-w-[24ch] text-[clamp(0.85rem,1.5vw,1.7rem)] text-text-secondary">
        Scan in and post a card you&rsquo;re looking for. The whole room sees it here.
      </p>
    </section>
  );
}

/** "CHUNC is looking for 2", or the many-people version. */
function askLine(flare: DisplayFlare): string {
  if (flare.people > 1) {
    return `${flare.people} people are looking for this`;
  }
  const who = flare.askedBy ?? "Somebody";
  return flare.quantity > 1
    ? `${who} is looking for ${flare.quantity}`
    : `${who} is looking for this`;
}
