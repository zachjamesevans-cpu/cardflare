import Link from "next/link";
import { Flame } from "lucide-react";

import { SectionLabel } from "@/components/events/night-header";
import { PlayerAvatar } from "@/components/players/player-avatar";
import type { RosterPlayer } from "@/lib/events/going";
import {
  flaresLine,
  matchesLine,
  PLAYERS_GOING,
  tradeCardsLine,
} from "@/lib/events/night-copy";

/**
 * Players going: who is on the roster, and why each one might matter.
 *
 * The founder (2026-10-03): "Move attendee information LOWER. People
 * should not just appear as names; show why they may matter. Example:
 * [Avatar] CHUNC / 9 Flares / 42 trade cards / 🔥 2 matches. If no
 * match: 9 Flares / 42 trade cards. Tapping the attendee opens their
 * event-facing profile."
 *
 * Compact rows separated by a hairline: the face, the name, "{n}
 * Flares · {n} trade cards", and "{n} matches" in the accent when
 * there are any. A guest on the roster has no account, so no profile
 * to open, no trade binder to count and no matches: their row is the
 * face, the name and their Flares. The count of people is on the
 * header line and is not repeated here. The app's players-going.tsx
 * draws the same rows with the same words; tests/unit/nights2-parity
 * .test.ts holds the two together.
 */
/**
 * One row per person on the roster. An account that joined from two
 * devices holds two sessions, and the roster is written per session;
 * the one kept is the present one, else the first. A guest is their
 * session and is kept as they are.
 */
export function dedupeRoster(roster: RosterPlayer[]): RosterPlayer[] {
  const byPerson = new Map<string, RosterPlayer>();
  for (const player of roster) {
    const key = player.playerId ?? player.playerSessionId;
    const kept = byPerson.get(key);
    if (!kept || (player.present && !kept.present)) byPerson.set(key, player);
  }
  return [...byPerson.values()];
}

export function PlayersGoing({
  roster,
  code,
}: {
  roster: RosterPlayer[];
  code: string;
}) {
  if (roster.length === 0) return null;

  return (
    <section className="flex flex-col gap-2" aria-labelledby="players-going">
      <SectionLabel id="players-going">{PLAYERS_GOING}</SectionLabel>
      <ul className="flex flex-col divide-y divide-border">
        {roster.map((player) => (
          <li
            key={player.playerSessionId}
            className="relative flex items-center gap-3 py-2"
          >
            <PlayerAvatar
              displayName={player.displayName}
              seed={player.playerId ?? player.playerSessionId}
              avatarUrl={player.avatarUrl}
              frame={player.frame}
              ring={player.ring}
              aura={player.aura}
              size="sm"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              {player.playerId ? (
                <Link
                  href={`/e/${code}/p/${player.playerId}`}
                  className="truncate text-sm font-semibold text-text-primary after:absolute after:inset-0 after:content-['']"
                >
                  {player.displayName}
                </Link>
              ) : (
                <span className="truncate text-sm font-semibold text-text-primary">
                  {player.displayName}
                </span>
              )}
              <span className="text-xs text-text-muted tabular-nums">
                {player.playerId
                  ? `${flaresLine(player.flares)} · ${tradeCardsLine(player.tradeCards)}`
                  : flaresLine(player.flares)}
              </span>
            </span>
            {player.matches > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-accent tabular-nums">
                <Flame className="size-3.5" aria-hidden="true" />
                {matchesLine(player.matches)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
