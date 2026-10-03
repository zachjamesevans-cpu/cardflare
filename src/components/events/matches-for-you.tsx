import Link from "next/link";
import { Flame } from "lucide-react";

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
