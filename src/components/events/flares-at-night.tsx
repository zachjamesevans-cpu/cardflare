"use client";

import { useId, useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";

import { cn } from "@/lib/cn";
import { FLARE_FILTERS, FLARES_AT_THIS_NIGHT } from "@/lib/events/night-copy";

export type FlareFilter = keyof typeof FLARE_FILTERS;

/** The three filters, in the order they are drawn. */
export const FLARE_FILTER_ORDER: FlareFilter[] = ["all", "hunting", "offering"];

/** What a filter with nothing behind it says. */
export const FILTER_EMPTY = "Nothing here yet.";

/**
 * Flares at this Night: the wider board, with All | Hunting | Offering.
 *
 * The founder (2026-10-03): "After personalized matches: 'Flares at
 * this Night', the wider event trading board. Show attendee Flares.
 * Keep the existing card-focused visual style. Filtering: All /
 * Hunting / Offering." Hunting is a Flare with intent "want";
 * Offering is one with intent "showcase".
 *
 * The tiles and the offer flow are exactly the board's own: the page
 * renders the board three times on the server, once per filter, with
 * every Server Action form intact, and this island only chooses which
 * of the three is on screen. No tile is re-rendered on the client and
 * no filter costs a round trip. The one-line note above the board is
 * where the offers on your own Flares are counted now, instead of a
 * card of their own. The app's flares-at-night.tsx draws the same
 * filter with the same words; tests/unit/nights2-parity.test.ts holds
 * the two together.
 */
export function FlaresAtNight({
  boards,
  note = null,
}: {
  /** The board, rendered once per filter; null where the filter is empty. */
  boards: Record<FlareFilter, ReactNode | null>;
  /** Offers on the viewer's own Flares, said once above the board. */
  note?: ReactNode;
}) {
  const [filter, setFilter] = useState<FlareFilter>("all");
  const id = useId();

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${id}-label`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id={`${id}-label`}
          className="text-xs font-semibold tracking-wide text-text-muted uppercase"
        >
          {FLARES_AT_THIS_NIGHT}
        </h2>
        <div
          role="tablist"
          aria-label="Filter the board"
          className="flex rounded-full border border-border bg-surface p-0.5"
        >
          {FLARE_FILTER_ORDER.map((key) => {
            const on = key === filter;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={`${id}-board`}
                onClick={() => setFilter(key)}
                className={cn(
                  "h-7 cursor-pointer rounded-full px-3 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
                  on
                    ? "bg-elevated text-text-primary"
                    : "text-text-muted hover:text-text-secondary",
                )}
              >
                {FLARE_FILTERS[key]}
              </button>
            );
          })}
        </div>
      </div>

      {note}

      <div id={`${id}-board`} role="tabpanel">
        {boards[filter] ?? (
          <p className="text-sm leading-5 text-text-secondary">{FILTER_EMPTY}</p>
        )}
      </div>
    </section>
  );
}

/**
 * "Somebody can help you": offers standing on the viewer's own Flares,
 * said once in one line above the board, where the MatchSummary card
 * used to be. The link jumps to their own group on the board, where
 * the offers themselves are listed under each Flare.
 */
export function OffersNote({
  offerCount,
  flareCount,
  anchor,
}: {
  /** Standing offers across all of the viewer's open Flares. */
  offerCount: number;
  /** How many distinct Flares of theirs have at least one offer. */
  flareCount: number;
  anchor: string;
}) {
  if (offerCount === 0) return null;

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <Sparkles className="size-4 shrink-0 text-accent" aria-hidden="true" />
      <span className="min-w-0 flex-1 basis-48 text-text-secondary">
        <strong className="font-semibold text-text-primary">
          {offerCount === 1
            ? "Someone offered to trade."
            : `${offerCount} offers on your Flares.`}
        </strong>{" "}
        {flareCount === 1
          ? "One of your Flares has a taker."
          : `${flareCount} of your Flares have takers.`}
      </span>
      <a
        href={anchor}
        className="shrink-0 font-medium text-accent underline underline-offset-4"
      >
        See who
      </a>
    </p>
  );
}
