"use client";

import type { ReactNode } from "react";

import type { DisplayFlare, DisplayPayload } from "@/lib/event-hub/display-payload";
import { TAKEOVER_MS, type Intermission } from "@/lib/event-hub/auto-mode";
import { GAME_PROFILES, procedureFor } from "@/lib/event-hub/game-profiles";
import {
  formatClock,
  overtimeCapMs,
  overtimeElapsedMs,
  type HubTimer,
} from "@/lib/event-hub/timer";
import { FeaturedCard } from "./featured-flare";

/**
 * The between-rounds takeover, on a screen a tournament has to itself.
 *
 * During the round the timer owns the wall. The moment time hits, the
 * priorities INVERT — the founder's brief: "The giant regulation timer
 * is no longer the main focus... FLARES and STORE CONTENT become much
 * more prominent. Use the available TV space aggressively." So the
 * round's afterlife gets a narrow column — what happens next, the
 * procedure, the QR — and the rest of the television becomes a rotation
 * of one huge card at a time and the store's announcement, big enough
 * that "oh, I have that card" happens from across the room.
 *
 * Three faces, all derived, none stored:
 *
 *   1. TIME IN ROUND, alone and enormous, for the first few seconds.
 *   2. The intermission: next-round countdown + rotating slides.
 *   3. WAITING FOR ORGANIZER, when held, blocked, or waiting on a person.
 */
export function IntermissionBody({
  payload,
  timer,
  intermission,
  now,
  tick,
  join,
}: {
  payload: DisplayPayload;
  timer: HubTimer;
  intermission: Intermission;
  now: number;
  tick: number;
  /** The QR panel, rendered by the display so this file never needs it. */
  join: ReactNode;
}) {
  const profile = GAME_PROFILES[timer.game];
  const procedure = procedureFor(profile, timer.bracket);

  /* Face 1: the call itself. Big, red, briefly unmissable. */
  if (now - intermission.anchor < TAKEOVER_MS) {
    return (
      <div
        style={{ ["--game" as string]: `var(${profile.accentToken})` }}
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[clamp(0.5rem,1.2vw,1.5rem)] rounded-[var(--radius-panel)] border-2 border-danger bg-surface text-center motion-safe:animate-[cf-overtime-in_var(--duration-slow)_var(--ease-out-soft)]"
      >
        <p className="text-[clamp(1.2rem,2.6vw,3rem)] font-bold tracking-tight text-[var(--game)] uppercase">
          {profile.shortName}
        </p>
        <p className="text-[clamp(3rem,9vw,10rem)] leading-none font-bold tracking-tight text-danger uppercase">
          Time in round
        </p>
        <p className="text-[clamp(1.2rem,2.4vw,2.75rem)] font-bold text-text-primary">
          {procedure.headline}
        </p>
        {procedure.extraTimeLine && (
          <p className="max-w-[40ch] text-[clamp(0.95rem,1.7vw,2rem)] text-text-secondary">
            {procedure.extraTimeLine}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      style={{ ["--game" as string]: `var(${profile.accentToken})` }}
      className="flex min-h-0 flex-1 gap-[clamp(0.5rem,1vw,1.25rem)]"
    >
      {/* The round's afterlife: what happens next, and how to join in. */}
      <div className="flex min-h-0 flex-[2] flex-col gap-[clamp(0.5rem,1vw,1.25rem)]">
        <NextRoundPanel timer={timer} intermission={intermission} now={now} />
        {payload.showQr && <div className="flex shrink-0 justify-center">{join}</div>}
      </div>

      {/* The takeover itself: the room's cards and the store's words,
          one at a time, as big as the television allows. */}
      <div className="min-h-0 flex-[3]">
        <IntermissionSlides
          flares={payload.showFlares ? payload.flares : []}
          flaresEnabled={payload.showFlares}
          announcement={payload.announcement}
          tick={tick}
        />
      </div>
    </div>
  );
}

/** The countdown to the next round — or the reason there isn't one. */
function NextRoundPanel({
  timer,
  intermission,
  now,
}: {
  timer: HubTimer;
  intermission: Intermission;
  now: number;
}) {
  const profile = GAME_PROFILES[timer.game];
  const procedure = procedureFor(profile, timer.bracket);
  const counting = intermission.state === "counting";

  /* The round that just ended still gets its extra-time clock here,
     small and red, because TIME IN ROUND does not mean every match is
     finished — the procedure is still running for somebody. */
  const otUp = overtimeElapsedMs(timer, now);
  const otCap = overtimeCapMs(timer, now);

  return (
    <section className="flex min-h-0 flex-1 flex-col justify-between gap-[clamp(0.4rem,0.9vw,1.1rem)] rounded-[var(--radius-panel)] border-2 border-border bg-surface p-[clamp(0.75rem,1.6vw,2rem)]">
      <header className="flex items-baseline justify-between gap-3">
        <p className="truncate text-[clamp(1.1rem,2.4vw,2.75rem)] leading-none font-bold tracking-tight text-[var(--game)] uppercase">
          {profile.shortName}
        </p>
        {timer.round !== null && (
          <p className="shrink-0 text-[clamp(0.8rem,1.4vw,1.5rem)] font-semibold text-text-muted">
            Round {timer.round} ended
          </p>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[clamp(0.3rem,0.7vw,0.9rem)] text-center">
        <p className="text-[clamp(0.9rem,1.7vw,2rem)] font-bold tracking-[0.14em] text-accent uppercase">
          Round {intermission.nextRound}
        </p>

        {counting ? (
          <p
            role="timer"
            aria-label={`Round ${intermission.nextRound} starts in ${formatClock(intermission.remainingMs)}`}
            className="font-mono text-[clamp(3rem,8vw,8rem)] leading-none font-bold text-text-primary tabular-nums"
          >
            {formatClock(intermission.remainingMs)}
          </p>
        ) : (
          <>
            <p className="text-[clamp(1.4rem,3vw,3.25rem)] leading-tight font-bold text-text-primary uppercase">
              Waiting for organizer
            </p>
            {intermission.state === "blocked" && (
              <p className="text-[clamp(0.85rem,1.5vw,1.6rem)] text-text-secondary">
                Extra time is still running.
              </p>
            )}
          </>
        )}
      </div>

      <footer className="flex flex-col gap-[0.35em]">
        <p className="text-[clamp(0.9rem,1.5vw,1.6rem)] font-bold text-[var(--game)]">
          {procedure.headline}
        </p>
        {procedure.extraTimeLine && (
          <p className="text-[clamp(0.75rem,1.2vw,1.25rem)] text-text-secondary">
            {procedure.extraTimeLine}
          </p>
        )}
        {otUp !== null && otCap !== null && (
          <p className="font-mono text-[clamp(0.85rem,1.4vw,1.5rem)] font-bold text-danger tabular-nums">
            Extra time {formatClock(otUp)}
            <span className="text-text-muted"> / {formatClock(otCap)}</span>
          </p>
        )}
      </footer>
    </section>
  );
}

/**
 * One thing at a time, enormous. The founder: "Use substantially larger
 * card artwork. Show fewer cards at once. Rotate content instead of
 * shrinking everything."
 */
function IntermissionSlides({
  flares,
  flaresEnabled,
  announcement,
  tick,
}: {
  flares: DisplayFlare[];
  /** False when the store turned the board off for this display. */
  flaresEnabled: boolean;
  announcement: string | null;
  tick: number;
}) {
  const count = flares.length + (announcement ? 1 : 0);

  if (count === 0) {
    /* "Post a Flare" is only promised where a posted Flare would
       actually appear. A display with the board switched off gets a
       plain break panel instead of an invitation it cannot honour. */
    return (
      <section className="flex h-full min-h-0 flex-col items-center justify-center gap-[clamp(0.4rem,0.8vw,1rem)] rounded-[var(--radius-panel)] border-2 border-dashed border-border bg-surface p-[clamp(0.75rem,1.5vw,2rem)] text-center">
        {flaresEnabled ? (
          <>
            <p className="text-[clamp(1.2rem,2.4vw,2.75rem)] font-bold tracking-[0.14em] text-text-primary uppercase">
              Post a Flare
            </p>
            <p className="max-w-[26ch] text-[clamp(0.95rem,1.8vw,2rem)] text-text-secondary">
              Scan in and post a card you&rsquo;re looking for. The whole room sees it
              here between rounds.
            </p>
          </>
        ) : (
          <p className="text-[clamp(1.2rem,2.4vw,2.75rem)] font-bold tracking-[0.14em] text-text-secondary uppercase">
            Between rounds
          </p>
        )}
      </section>
    );
  }

  const position = tick % count;
  const isAnnouncement = announcement !== null && position === flares.length;

  return (
    <section
      className="flex h-full min-h-0 flex-col gap-[clamp(0.4rem,0.8vw,1rem)] rounded-[var(--radius-panel)] border-2 border-border bg-surface p-[clamp(0.75rem,1.5vw,2rem)]"
      aria-label={isAnnouncement ? "Store announcement" : "Wanted in the room"}
    >
      <p className="shrink-0 text-[clamp(0.85rem,1.5vw,1.7rem)] font-bold tracking-[0.18em] text-accent uppercase">
        {isAnnouncement ? "Store announcement" : "Wanted in the room"}
      </p>

      <div
        key={isAnnouncement ? "announcement" : flares[position].cardId}
        className="flex min-h-0 flex-1 flex-col motion-safe:animate-[cf-flare-in_var(--duration-slow)_var(--ease-out-soft)]"
      >
        {isAnnouncement ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <p className="max-w-[24ch] text-center text-[clamp(1.75rem,4.5vw,5rem)] leading-tight font-bold text-text-primary">
              {announcement}
            </p>
          </div>
        ) : (
          <FeaturedCard flare={flares[position]} />
        )}
      </div>
    </section>
  );
}
