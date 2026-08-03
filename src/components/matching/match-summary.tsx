import { Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";

/**
 * "Somebody can help you" — the requester's one-line summary.
 *
 * Rendered only when there is something to say, near the top of the room so
 * a player who posted Flares an hour ago and has been trading since sees it
 * without scrolling. The link jumps to their own group on the board, where
 * the offers themselves are listed under each Flare.
 */
export function MatchSummary({
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
    <Card className="flex flex-wrap items-center gap-x-3 gap-y-2 border-accent/40 bg-accent/[0.07] p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/15">
        <Sparkles className="size-4.5 text-accent" aria-hidden="true" />
      </span>

      <p className="min-w-0 flex-1 basis-48 text-sm text-text-secondary">
        <strong className="font-semibold text-text-primary">
          {offerCount === 1
            ? "Someone offered to trade."
            : `${offerCount} offers on your Flares.`}
        </strong>{" "}
        {flareCount === 1
          ? "One of your Flares has a taker."
          : `${flareCount} of your Flares have takers.`}
      </p>

      <a
        href={anchor}
        className="shrink-0 text-sm font-medium text-accent underline underline-offset-4"
      >
        See who
      </a>
    </Card>
  );
}
