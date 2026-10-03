import Link from "next/link";

import { MutualMatchBlock } from "@/components/events/mutual-match";
import { MessageButton } from "@/components/players/message-button";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Card } from "@/components/ui/card";
import {
  FROM_YOUR_FLARE,
  IN_YOUR_BINDER,
  NO_MATCHES,
  THEY_HAVE_WHAT_YOU_WANT,
  THEY_WANT_WHAT_YOU_HAVE,
} from "@/lib/events/night-copy";
import type { MatchPlayer, NightMatches } from "@/lib/events/night-matches";
import { SectionLabel } from "@/components/events/night-header";

/**
 * See all matches: everything Cardflare found for this viewer at this
 * night, in the order that matters.
 *
 * The founder (2026-10-03): "Two major categories: THEY HAVE WHAT YOU
 * WANT: players whose public Trade Binder or Flares contain cards the
 * user is hunting... THEY WANT WHAT YOU HAVE: players whose Flares
 * include cards in the current user's public Trade Binder." And the
 * mutual matches first, since "Mutual Match should feel like one of
 * Cardflare's signature mechanics."
 *
 * One card per player in each list: their face, their name (which
 * opens their event-facing profile), one line per card, and Message.
 * The app's night-matches.tsx draws the same three lists with the same
 * words; tests/unit/nights2-parity.test.ts holds the two together.
 */

/** The face and the name that opens their event-facing profile. */
export function MatchPlayerLine({
  player,
  code,
  trailing,
}: {
  player: MatchPlayer;
  code: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <PlayerAvatar
        displayName={player.displayName}
        seed={player.playerId}
        avatarUrl={player.avatarUrl}
        frame={player.frame}
        ring={player.ring}
        aura={player.aura}
        size="sm"
      />
      <Link
        href={`/e/${code}/p/${player.playerId}`}
        className="min-w-0 flex-1 truncate font-semibold text-text-primary underline-offset-4 hover:underline"
      >
        {player.displayName}
      </Link>
      {trailing}
    </div>
  );
}

export function MatchList({
  matches,
  code,
  imagesEnabled,
  canMessage,
}: {
  matches: NightMatches;
  code: string;
  imagesEnabled: boolean;
  /** Message needs an account on both ends; false draws no button. */
  canMessage: boolean;
}) {
  const nothing =
    matches.mutual.length === 0 &&
    matches.theyHave.length === 0 &&
    matches.theyWant.length === 0;

  if (nothing) {
    return <p className="text-sm leading-5 text-text-secondary">{NO_MATCHES}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {matches.mutual.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label="Mutual matches">
          {matches.mutual.map((match) => (
            <li key={match.player.playerId}>
              <MutualMatchBlock
                match={match}
                code={code}
                imagesEnabled={imagesEnabled}
                canMessage={canMessage}
              />
            </li>
          ))}
        </ul>
      )}

      {matches.theyHave.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="they-have">
          <SectionLabel id="they-have">{THEY_HAVE_WHAT_YOU_WANT}</SectionLabel>
          <ul className="flex flex-col gap-2">
            {matches.theyHave.map((match) => (
              <Card
                as="li"
                key={match.player.playerId}
                className="flex flex-col gap-3 p-4"
              >
                <MatchPlayerLine player={match.player} code={code} />
                <ul className="flex flex-col gap-1.5 text-sm">
                  {match.cards.map(({ card, fromYourFlare }) => (
                    <li key={card.cardId} className="flex flex-col">
                      <span className="text-text-primary">
                        <span className="text-text-muted">Has:</span> {card.name}{" "}
                        <span className="font-mono text-xs text-text-muted">
                          {card.number}
                        </span>
                      </span>
                      {fromYourFlare && (
                        <span className="text-xs text-accent">{FROM_YOUR_FLARE}</span>
                      )}
                    </li>
                  ))}
                </ul>
                {canMessage && <MessageButton playerId={match.player.playerId} />}
              </Card>
            ))}
          </ul>
        </section>
      )}

      {matches.theyWant.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="they-want">
          <SectionLabel id="they-want">{THEY_WANT_WHAT_YOU_HAVE}</SectionLabel>
          <ul className="flex flex-col gap-2">
            {matches.theyWant.map((match) => (
              <Card
                as="li"
                key={match.player.playerId}
                className="flex flex-col gap-3 p-4"
              >
                <MatchPlayerLine player={match.player} code={code} />
                <ul className="flex flex-col gap-1.5 text-sm">
                  {match.cards.map((card) => (
                    <li key={card.cardId} className="flex flex-col">
                      <span className="text-text-primary">
                        <span className="text-text-muted">Looking for:</span>{" "}
                        {card.name}{" "}
                        <span className="font-mono text-xs text-text-muted">
                          {card.number}
                        </span>
                      </span>
                      <span className="text-xs text-accent">{IN_YOUR_BINDER}</span>
                    </li>
                  ))}
                </ul>
                {canMessage && <MessageButton playerId={match.player.playerId} />}
              </Card>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
