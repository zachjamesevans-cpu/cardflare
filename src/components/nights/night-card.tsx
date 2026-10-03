import Link from "next/link";
import { Flame } from "lucide-react";

import { GoingButton } from "@/components/nights/going-button";
import { VerifiedMark } from "@/components/stores/verified-mark";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { matchesLine, playersLine } from "@/lib/events/night-copy";
import type { NightItem } from "@/lib/events/nights";

/**
 * One night on the Nights tab, short enough to scan a dozen of.
 *
 * The founder (2026-10-03): "EVENT CARDS: significantly shorter. Each
 * card: event name, venue, date/time, RSVP state, number attending,
 * number of potential trade matches if available." And: "Potential
 * matches should have significantly more visual priority than generic
 * attendance. If there are no matches yet, attendance can take that
 * space instead."
 *
 * So: a date block on the left (the month over the day, in the store's
 * zone), then the name, the venue with the Verified glyph, the start
 * time ("Open now" while live, "Ended" once it is over), and one line
 * of three things: the RSVP (the check and "Going" when you are, the
 * Going chip when you are not, nothing on a night that has ended),
 * "{n} players", and "{n} matches" in the accent with the flame when
 * there are any. Under 100px tall at a phone's width. The whole card
 * opens the night; the chip keeps its own tap above the stretched link.
 *
 * The app's nights.tsx draws the same card with the same words;
 * tests/unit/nights2-parity.test.ts holds the two together.
 */

/** "OCT" over "03": the month and the day in the store's own zone. */
export function dateBlock(
  iso: string,
  timeZone: string,
): { month: string; day: string } {
  const date = new Date(iso);
  return {
    month: new Intl.DateTimeFormat("en-US", { month: "short", timeZone })
      .format(date)
      .toUpperCase(),
    day: new Intl.DateTimeFormat("en-US", { day: "2-digit", timeZone }).format(date),
  };
}

/** "11:00 AM", in the store's own zone. */
export function startTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/** The third line: when the night is, or what it is doing now. */
export function timeLine(night: Pick<NightItem, "phase" | "startsAt" | "timeZone">) {
  if (night.phase === "live") return "Open now";
  if (night.phase === "finished") return "Ended";
  return startTime(night.startsAt, night.timeZone);
}

export function NightCard({
  night,
  signedIn,
}: {
  night: NightItem;
  signedIn: boolean;
}) {
  const href = night.code ? `/e/${night.code}` : `/s/${night.storeId}`;
  const { month, day } = dateBlock(night.startsAt, night.timeZone);
  const past = night.phase === "finished";
  const matches = night.matches ?? 0;

  return (
    <Card
      as="li"
      className={cn(
        "relative flex items-stretch gap-3 px-3 py-2.5 transition-colors hover:border-border-strong",
        night.phase === "live" && "border-accent/40",
      )}
    >
      {/* The date, as a calendar page: the month small over the day
          large, so a column of cards reads as a week at a glance. */}
      <div
        className="flex w-11 shrink-0 flex-col items-center justify-center rounded-[var(--radius-control)] bg-elevated"
        aria-hidden="true"
      >
        <span className="text-[10px] leading-3 font-semibold tracking-wide text-text-muted">
          {month}
        </span>
        <span className="text-lg leading-6 font-bold text-text-primary tabular-nums">
          {day}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <Link
          href={href}
          className="truncate text-[15px] leading-5 font-semibold text-text-primary after:absolute after:inset-0 after:content-['']"
        >
          {night.name}
        </Link>
        <p className="flex items-center gap-1 truncate text-xs leading-4 text-text-secondary">
          <span className="truncate">{night.storeName}</span>
          {night.storeVerified && <VerifiedMark className="size-3.5" />}
        </p>
        <p
          className={cn(
            "text-xs leading-4 tabular-nums",
            night.phase === "live" ? "font-semibold text-accent" : "text-text-muted",
          )}
        >
          {timeLine(night)}
        </p>

        {/* One line: the RSVP, the players, the matches. Above the
            stretched link so the chip keeps its own tap. */}
        <p className="relative z-10 mt-1 flex h-6 flex-wrap items-center gap-x-3 text-xs">
          {!past && (
            <GoingButton
              eventId={night.eventId}
              youGoing={night.youGoing}
              goingCount={night.goingCount}
              signedIn={signedIn}
              next={href}
              compact
            />
          )}
          <span className="text-text-secondary tabular-nums">
            {playersLine(night.goingCount)}
          </span>
          {matches > 0 && (
            <span className="inline-flex items-center gap-1 font-semibold text-accent tabular-nums">
              <Flame className="size-3.5" aria-hidden="true" />
              {matchesLine(matches)}
            </span>
          )}
        </p>
      </div>
    </Card>
  );
}
