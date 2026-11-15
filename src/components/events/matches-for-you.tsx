import Link from "next/link";
import { ChevronRight, Flame } from "lucide-react";

import { MutualMatchBlock } from "@/components/events/mutual-match";
import { SectionLabel } from "@/components/events/night-header";
import { buttonStyles } from "@/components/ui/button";
import {
  huntingHereLine,
  MATCHES_FOR_YOU,
  matchesForYouLine,
  NO_MATCHES,
  SEE_ALL_MATCHES,
  wantYoursLine,
} from "@/lib/events/night-copy";
import type { NightMatches } from "@/lib/events/night-matches";
import { roomMatchLine } from "@/lib/events/room-view";

/** How many mutual matches the night page draws before "See all". */
export const INLINE_MUTUAL = 3;

/**
 * Matches for you: the first thing under the header, for a signed-in
 * viewer.
 *
 * The founder (2026-10-03): "THIS SHOULD BE THE MOST IMPORTANT SECTION.
 * Directly under the event header/banner: '🔥 Matches for you'.
 * Example: '🔥 7 matches for you / 4 cards you're hunting are here /
 * 3 players want cards you have / [See all matches]'." And: "The user
 * should see the event header, the match count, and at least part of
 * their first match without scrolling far."
 *
 * So the count is the heading, the two lines under it say which way
 * the matches point, See all opens the full list, and up to three
 * mutual matches follow right here. With nothing found, one quiet
 * line says Cardflare is still looking. The app's matches-for-you.tsx
 * draws the same block with the same words; tests/unit/nights2-parity
 * .test.ts holds the two together.
 */
export function MatchesForYou({
  matches,
  code,
  imagesEnabled,
}: {
  matches: NightMatches;
  code: string;
  imagesEnabled: boolean;
}) {
  const { summary } = matches;

  if (summary.total === 0) {
    return (
      <section className="flex flex-col gap-2" aria-labelledby="matches-for-you">
        <SectionLabel id="matches-for-you">{MATCHES_FOR_YOU}</SectionLabel>
        <p className="text-sm leading-5 text-text-secondary">{NO_MATCHES}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="matches-for-you">
      <div className="flex flex-col gap-1">
        <h2
          id="matches-for-you"
          className="flex items-center gap-2 text-lg font-bold text-text-primary"
        >
          <Flame className="size-5 text-accent" aria-hidden="true" />
          {matchesForYouLine(summary.total)}
        </h2>
        <ul className="flex flex-col text-sm text-text-secondary">
          {summary.cardsHuntingHere > 0 && (
            <li>{huntingHereLine(summary.cardsHuntingHere)}</li>
          )}
          {summary.playersWantYours > 0 && (
            <li>{wantYoursLine(summary.playersWantYours)}</li>
          )}
        </ul>
      </div>

      <Link href={`/e/${code}/matches`} className={buttonStyles("secondary", "sm")}>
        {SEE_ALL_MATCHES}
      </Link>

      {matches.mutual.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label="Mutual matches">
          {matches.mutual.slice(0, INLINE_MUTUAL).map((match) => (
            <li key={match.player.playerId}>
              <MutualMatchBlock
                match={match}
                code={code}
                imagesEnabled={imagesEnabled}
                canMessage
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Matches, in the room: one line, or nothing.
 *
 * The founder (2026-10-03) put matches first, "Directly under the event
 * header/banner", and they still are. But a scan at the counter landed
 * on the whole block above, and the founder (2026-11-15): "When someone
 * scans into a room I feel like it should be dead simple imo. This is
 * so much info." So while the night is on, the block is one line that
 * opens the same full list See all matches does, and it is not drawn
 * at all when nobody here matters to you. Before the night, planning,
 * the block above stays whole. `roomMatchLine` is the app's words too.
 */
export function RoomMatchLine({
  summary,
  code,
}: {
  summary: NightMatches["summary"];
  code: string;
}) {
  const line = roomMatchLine(summary);
  if (line === null) return null;

  return (
    <Link
      href={`/e/${code}/matches`}
      /* A tinted pill, the app's RoomMatchLine: it is the one thing in
         the room that says somebody here matters to you. */
      className="flex min-h-12 items-center gap-2.5 rounded-[var(--radius-card)] border border-accent/40 bg-accent/10 px-3.5 py-2.5 text-sm font-semibold text-text-primary hover:border-accent/70 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
    >
      <Flame className="size-5 shrink-0 text-accent" aria-hidden="true" />
      <span className="min-w-0 flex-1">{line}</span>
      <ChevronRight className="size-5 shrink-0 text-accent" aria-hidden="true" />
    </Link>
  );
}
