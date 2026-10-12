import Link from "next/link";

import { FeedTile } from "@/components/feed/feed-tile";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { WantedSummary } from "@/lib/nearby/matching";
import {
  WANTED_HEADING,
  WANTED_PATH,
  WANTED_PRIVATE_LINE,
  wantedCountLine,
} from "@/lib/nearby/shared";

/** "14 people · closest under 2 mi away", for one card's line. */
export function peopleLine(count: number, nearestLabel: string): string {
  return `${count} ${count === 1 ? "person" : "people"} · closest ${nearestLabel
    .charAt(0)
    .toLowerCase()}${nearestLabel.slice(1)}`;
}

/**
 * WANTED NEAR YOU, on the Feed: the three cards of yours the most
 * people near you want, a few faces on each, and the way into the
 * whole list. The same size whether three people are looking or three
 * hundred - the founder: "we need a way to consolidate that screen so
 * that it's not overwhelming." The app draws the same card
 * (mobile/src/nearby.tsx, WantedSummaryCard).
 */
export function WantedSummaryCard({ summary }: { summary: WantedSummary }) {
  return (
    <Card className="flex flex-col gap-3 border-accent/40 bg-gradient-to-b from-accent/5 to-transparent p-4">
      <div className="flex flex-col gap-0.5">
        <p className="text-[11px] font-bold tracking-[0.16em] text-accent uppercase">
          {WANTED_HEADING}
        </p>
        <p className="text-sm font-semibold text-text-primary">
          {wantedCountLine(summary.totalPeople)}
        </p>
        <p className="text-xs text-text-muted">{WANTED_PRIVATE_LINE}</p>
      </div>

      <div className="flex flex-col gap-3">
        {summary.groups.map((group) => (
          <Link
            key={group.card.cardId}
            href={WANTED_PATH}
            className="flex items-center gap-3 rounded-[var(--radius-control)] focus-visible:outline-2 focus-visible:outline-accent"
          >
            <FeedTile
              imageUrl={group.card.imageUrl}
              name={group.card.cardName}
              cardNumber={group.card.cardNumber}
              match={group.card.match}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-semibold text-text-primary">
                {group.card.cardName}
              </span>
              <span className="truncate text-xs text-text-muted">
                {peopleLine(group.count, group.nearestLabel)}
              </span>
            </span>
            <span className="flex shrink-0 items-center">
              {group.faces.map((face, index) => (
                <span
                  key={face.playerId}
                  className={cn(
                    "rounded-full ring-2 ring-surface",
                    index > 0 && "-ml-2",
                  )}
                >
                  <PlayerAvatar
                    displayName={face.displayName}
                    seed={face.playerId}
                    avatarUrl={face.avatarUrl}
                    frame={face.frame}
                    size="sm"
                  />
                </span>
              ))}
              {group.count > group.faces.length && (
                <span className="ml-1.5 text-xs font-semibold text-text-muted">
                  +{group.count - group.faces.length}
                </span>
              )}
            </span>
          </Link>
        ))}
      </div>

      <Link
        href={WANTED_PATH}
        className={cn(buttonStyles("secondary", "sm"), "self-stretch")}
      >
        {summary.totalCards > summary.groups.length
          ? `See all ${summary.totalCards} cards`
          : "See everyone"}
      </Link>
    </Card>
  );
}
