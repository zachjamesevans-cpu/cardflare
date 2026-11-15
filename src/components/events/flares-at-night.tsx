import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

import { FLARES_AT_THIS_NIGHT } from "@/lib/events/night-copy";

/**
 * Flares at this Night: the wider board, under its label.
 *
 * The founder (2026-10-03): "After personalized matches: 'Flares at
 * this Night', the wider event trading board. Show attendee Flares.
 * Keep the existing card-focused visual style. Filtering: All /
 * Hunting / Offering." Hunting was a Flare with intent "want";
 * Offering one with intent "showcase".
 *
 * The filter is gone now. The founder took offering out of CardFlare
 * (2026-10-15): "delete the offering thing altogether... just having a
 * binder is more than enough for trades." After that Offering could
 * only ever be empty and Hunting was All, so the row was two buttons
 * that changed nothing. And on the room itself (2026-11-15): "When
 * someone scans into a room I feel like it should be dead simple imo.
 * This is so much info." So the section is the label, the one-line
 * note about offers on your own Flares, and the board, drawn once.
 *
 * The tiles and the offer flow are exactly the board's own, rendered
 * on the server with every Server Action form intact, so this is a
 * Server Component with nothing of its own to do in the browser. The
 * app's room draws the same section with the same words;
 * tests/unit/nights2-parity.test.ts holds the two together.
 */
export function FlaresAtNight({
  board,
  note = null,
}: {
  /** The board: the viewer's working board, or the read-only one. */
  board: ReactNode;
  /** Offers on the viewer's own Flares, said once above the board. */
  note?: ReactNode;
}) {
  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="flares-at-this-night"
      data-tour="room:board"
    >
      <h2
        id="flares-at-this-night"
        className="text-xs font-semibold tracking-wide text-text-muted uppercase"
      >
        {FLARES_AT_THIS_NIGHT}
      </h2>

      {note}

      {board}
    </section>
  );
}

/**
 * "Somebody can help you": offers standing on the viewer's own Flares,
 * said once in one line above the board, where the MatchSummary card
 * used to be. The link jumps to their own group on the board, where
 * the offers themselves are listed under each Flare. That group is
 * folded to one line until it matters, and an offer is when it does,
 * so it is open whenever this line is drawn (YourFlaresFold opens it
 * again if it was hidden since).
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
