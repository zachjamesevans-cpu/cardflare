"use client";

import type { DisplayFlare } from "@/lib/event-hub/display-payload";
import type { FlareShape } from "@/lib/event-hub/layout";

/**
 * What the room is looking for, on the wall.
 *
 * Every card here came off the public board — somebody posted it, to a
 * room, on purpose. Nothing on this screen is read out of anybody's
 * binder; see `display-payload.ts`, which is the only place that
 * decides.
 *
 * The three shapes are the same component at three densities, because
 * how much room the board gets is decided by how many tournaments are
 * running, and a shop with four timers still deserves a board rather
 * than an empty strip.
 */

/**
 * Columns, from how many cards are actually showing.
 *
 * Driven by the count rather than by the shape, because the two can
 * disagree: three tournaments in a row leave a strip that holds three,
 * and a strip hardcoded to two columns wrapped the third card onto a
 * second row and clipped it off the bottom of the television.
 */
const COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

export function FlareBoard({
  flares,
  shape,
  /* Bumped by the rotation so the crossfade restarts. Not used for
     anything else — the window itself is chosen upstream. */
  tick,
}: {
  flares: DisplayFlare[];
  shape: FlareShape;
  tick: number;
}) {
  if (flares.length === 0) return <EmptyBoard shape={shape} />;

  return (
    <div className="flex h-full min-h-0 flex-col gap-[clamp(0.3rem,0.6vw,0.75rem)]">
      <p className="shrink-0 text-[clamp(0.65rem,0.9vw,1rem)] font-semibold tracking-[0.18em] text-accent uppercase">
        Wanted in the room
      </p>

      <div
        key={tick}
        className={`grid min-h-0 flex-1 gap-[clamp(0.4rem,0.8vw,1rem)] motion-safe:animate-[cf-flare-in_var(--duration-slow)_var(--ease-out-soft)] ${
          COLUMNS[Math.min(4, Math.max(1, flares.length))]
        }`}
      >
        {flares.map((flare) => (
          <FlareCard key={flare.cardId} flare={flare} shape={shape} />
        ))}
      </div>
    </div>
  );
}

function FlareCard({ flare, shape }: { flare: DisplayFlare; shape: FlareShape }) {
  const compact = shape === "strip";

  return (
    <article className="flex min-w-0 items-center gap-[clamp(0.4rem,0.8vw,1rem)] overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface p-[clamp(0.4rem,0.7vw,0.85rem)]">
      <span className="block w-[clamp(2.5rem,4.5vw,5.5rem)] shrink-0 overflow-hidden rounded-[6px] border border-border bg-elevated">
        <span className="block aspect-[60/84] w-full">
          {/* A plain img in a fixed box. The art is immutable and CDN
              cached, so eight hours of rotation re-downloads nothing, and
              next/image would add a transform per card for no gain. */}
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

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-[clamp(0.75rem,1.15vw,1.35rem)] font-bold text-text-primary">
          {flare.cardName}
        </p>
        <p className="truncate font-mono text-[clamp(0.6rem,0.85vw,0.95rem)] text-text-muted">
          {flare.cardNumber}
        </p>

        <p className="truncate text-[clamp(0.65rem,0.9vw,1rem)] font-semibold text-accent">
          {/* Wanting four copies is a different sentence from four people
              wanting one, and a shop cares about the difference. */}
          {flare.people > 1
            ? `${flare.people} people are looking for this`
            : flare.askedBy
              ? `${flare.askedBy} is looking for this`
              : "Looking for this"}
        </p>

        {!compact && (
          <p className="truncate text-[clamp(0.6rem,0.85vw,0.95rem)] text-text-secondary">
            Looking for {flare.quantity}
            {flare.storeMayHave && (
              /* A boolean somebody already asked about. Never a price,
                 never a count, and never a route to the stock list. */
              <span className="ml-2 rounded-full bg-elevated px-2 py-0.5 text-text-primary">
                Store may have this
              </span>
            )}
          </p>
        )}
      </div>
    </article>
  );
}

function EmptyBoard({ shape }: { shape: FlareShape }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 rounded-[var(--radius-card)] border border-dashed border-border p-4 text-center">
      <p
        className={`font-bold text-text-secondary ${
          shape === "strip"
            ? "text-[clamp(0.85rem,1.2vw,1.2rem)]"
            : "text-[clamp(1.1rem,2vw,2rem)]"
        }`}
      >
        Nothing on the board yet
      </p>
      <p
        className={`text-text-muted ${
          shape === "strip"
            ? "text-[clamp(0.7rem,0.9vw,0.9rem)]"
            : "text-[clamp(0.85rem,1.2vw,1.25rem)]"
        }`}
      >
        Scan to post a card you&rsquo;re looking for.
      </p>
    </div>
  );
}
