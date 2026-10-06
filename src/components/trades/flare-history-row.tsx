"use client";

import Link from "next/link";

import { PlayerAvatar } from "@/components/players/player-avatar";
import { LocalDate, useMounted } from "@/components/ui/local-date";
import { QuantityBadge } from "@/components/ui/quantity-badge";
import { cn } from "@/lib/cn";
import type { FlareHistoryEntry, FlareOutcome } from "@/lib/flares/history";

/**
 * A past Flare, in History.
 *
 * The founder, looking at greyed-out FOUND rows on the Flare tab: "past
 * flares should live somewhere, or a flare history of sorts... it could
 * be cool to see a log of who answered the flare, date and time etc."
 * So the row is the card (its art, its name, how many), how it ended,
 * when it went up and when it stopped, and everyone who answered it:
 * their face, their name, when, and how many they could bring. Each
 * answer opens your conversation with them when there is one. The
 * app's History draws the same row with the same words.
 */

export const FLARE_OUTCOME_LABELS: Record<FlareOutcome, string> = {
  found: "Found",
  traded: "Traded",
  "taken-down": "Taken down",
};

/** "Fri, Sep 12, 3:04 PM": an answer's moment, in the reader's clock. */
function LocalMoment({ iso }: { iso: string }) {
  const mounted = useMounted();
  if (!mounted) return <span aria-hidden="true">&nbsp;</span>;
  return (
    <span>
      {new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(iso))}
    </span>
  );
}

export function FlareHistoryRow({ flare }: { flare: FlareHistoryEntry }) {
  return (
    <li className="flex items-start gap-3 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
      <span className="relative block w-11 shrink-0 overflow-hidden rounded-[5px] border border-border bg-elevated">
        <span className="block aspect-[60/84] w-full">
          {flare.imageUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={flare.imageUrl} alt="" className="size-full object-cover" />
          )}
        </span>
        <QuantityBadge
          quantity={flare.quantity}
          className="pointer-events-none absolute top-0.5 left-0.5"
        />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <Link
            href={`/cards/${flare.cardId}`}
            className="truncate font-semibold text-text-primary underline-offset-4 hover:underline"
          >
            {flare.cardName}
          </Link>
          {flare.quantity > 1 && <span className="sr-only">×{flare.quantity}</span>}
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold",
              flare.outcome === "taken-down"
                ? "border-border text-text-muted"
                : "border-accent/60 text-accent",
            )}
          >
            {FLARE_OUTCOME_LABELS[flare.outcome]}
          </span>
        </p>
        <p className="truncate text-xs text-text-muted">
          {flare.direction === "showcase" && (
            <>
              Offering
              <span aria-hidden="true"> · </span>
            </>
          )}
          Posted <LocalDate iso={flare.postedAt} format="day" />
          <span aria-hidden="true"> · </span>
          Ended <LocalDate iso={flare.endedAt} format="day" />
        </p>

        {flare.responders.length > 0 && (
          <ul className="mt-1.5 flex flex-col gap-1" aria-label="Who answered">
            {flare.responders.map((responder, index) => {
              const inner = (
                <>
                  <PlayerAvatar
                    displayName={responder.name}
                    seed={responder.playerId ?? `${flare.flareId}-${index}`}
                    avatarUrl={responder.avatarUrl}
                    size="sm"
                    className="size-6! text-[10px]!"
                  />
                  <span className="min-w-0 truncate text-xs text-text-secondary">
                    <span className="font-semibold text-text-primary">
                      {responder.name}
                    </span>
                    <span aria-hidden="true"> · </span>
                    <LocalMoment iso={responder.at} />
                  </span>
                  <QuantityBadge quantity={responder.quantity} className="shrink-0" />
                </>
              );
              return (
                <li key={`${responder.playerId ?? "guest"}-${index}`}>
                  {responder.threadId ? (
                    <Link
                      href={`/local?thread=${encodeURIComponent(responder.threadId)}`}
                      className="flex min-w-0 items-center gap-2 rounded-[var(--radius-control)] hover:bg-elevated"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <span className="flex min-w-0 items-center gap-2">{inner}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </li>
  );
}
