import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { Card } from "@/components/ui/card";
import { GAME_IDS, GAME_PROFILES, NIGHT_BASICS } from "@/lib/event-hub/game-profiles";

/**
 * A first tournament, explained before anybody has to ask.
 *
 * The founder's request, written from the player's side: "just a way
 * where they feel comfortable [entering] tournaments." The audience is
 * somebody standing in a shop watching a round happen, wondering
 * whether next week they could sit down - so the page answers what a
 * night IS, then what each game expects, and nothing else. No rules
 * lawyering: every game links to its official document for that.
 *
 * All the content is data in `game-profiles.ts`, beside the timer
 * procedures it has to stay consistent with, and the app renders the
 * same data natively.
 */

export const metadata: Metadata = {
  title: "New to tournaments?",
  description:
    "What a tournament night at your local shop actually looks like, game by game.",
};

export default function TournamentsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/feed"
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">
          New to tournaments?
        </h1>
        <p className="text-text-secondary">
          Here is the whole thing, honestly. It is a room of people who like the same
          game you do, playing it on a clock.
        </p>
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text-primary">
          How a night works, in any game
        </h2>
        <ol className="flex list-none flex-col gap-2.5">
          {NIGHT_BASICS.map((line, index) => (
            <li key={index} className="flex gap-3 text-sm text-text-secondary">
              {/* Numbered because a night genuinely is a sequence: you
                  sign up, then rounds happen, then you go home. */}
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-elevated font-mono text-xs font-bold text-accent">
                {index + 1}
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
      </Card>

      {GAME_IDS.map((id) => {
        const game = GAME_PROFILES[id];

        return (
          <Card key={id} className="flex flex-col gap-3">
            <h2
              className="text-lg font-bold"
              style={{ color: `var(${game.accentToken})` }}
            >
              {game.displayName}
            </h2>
            <ul className="flex list-none flex-col gap-2">
              {game.beginnerTldr.map((line, index) => (
                <li key={index} className="flex gap-2.5 text-sm text-text-secondary">
                  <span
                    className="mt-[7px] size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: `var(${game.accentToken})` }}
                    aria-hidden
                  />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <a
              href={game.officialRulesUrl}
              target="_blank"
              rel="noreferrer"
              className="flex w-fit items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover"
            >
              Official rules <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </Card>
        );
      })}

      <p className="text-sm text-text-muted">
        Formats and timings vary by shop and by event, so the numbers here are the
        common case, not a promise. The screen at the event always shows the real clock
        and the real end-of-round procedure.
      </p>
    </main>
  );
}
