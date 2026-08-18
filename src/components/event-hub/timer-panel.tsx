"use client";

import {
  GAME_PROFILES,
  nameRepeatsGame,
  procedureFor,
  RULES_DISCLAIMER,
} from "@/lib/event-hub/game-profiles";
import type { ResolvedLayout } from "@/lib/event-hub/layout";
import {
  elapsedMs,
  formatClock,
  overtimeRemainingMs,
  remainingMs,
  showsOvertimeRules,
  speakClock,
  timerPhase,
  urgency,
  type HubTimer,
  type TimerPhase,
  type Urgency,
} from "@/lib/event-hub/timer";

/**
 * One tournament, on the wall.
 *
 * Sized by layout rather than by media query, because what decides how
 * big a countdown can be is how many countdowns are sharing the screen —
 * a 1366x768 projector with one round has more room for digits than a
 * 1080p television with four.
 */

/** Digit sizes per layout. Fluid, so a 4:3 projector is not left with gaps. */
const CLOCK_SIZE: Record<ResolvedLayout, string> = {
  single: "text-[clamp(5rem,19vw,17rem)]",
  split: "text-[clamp(3.5rem,10vw,9.5rem)]",
  grid: "text-[clamp(2.5rem,6.5vw,6rem)]",
};

const TITLE_SIZE: Record<ResolvedLayout, string> = {
  single: "text-[clamp(1.5rem,3.2vw,3rem)]",
  split: "text-[clamp(1.1rem,2vw,1.9rem)]",
  grid: "text-[clamp(0.9rem,1.4vw,1.3rem)]",
};

const META_SIZE: Record<ResolvedLayout, string> = {
  single: "text-[clamp(1rem,1.7vw,1.6rem)]",
  split: "text-[clamp(0.85rem,1.2vw,1.15rem)]",
  grid: "text-[clamp(0.7rem,0.95vw,0.9rem)]",
};

/**
 * What the panel's border and clock do at each urgency.
 *
 * Never a full-screen flash. A shop is a room people are concentrating
 * in, and a television that strobes at five minutes is a television
 * somebody unplugs. The band is carried by a WORD as well as a colour,
 * so it survives being read by somebody who cannot tell the two reds
 * apart.
 */
const URGENCY_RING: Record<Urgency, string> = {
  none: "border-border",
  ten: "border-warning/40",
  five: "border-warning/70 shadow-[0_0_40px_-12px_var(--color-warning)]",
  one: "border-danger shadow-[0_0_48px_-10px_var(--color-danger)]",
};

const URGENCY_DIGITS: Record<Urgency, string> = {
  none: "text-text-primary",
  ten: "text-text-primary",
  five: "text-warning",
  one: "text-danger",
};

const URGENCY_WORD: Record<Urgency, string | null> = {
  none: null,
  ten: "Under 10 minutes",
  five: "Under 5 minutes",
  one: "Final minute",
};

const PHASE_WORD: Record<TimerPhase, string> = {
  ready: "Ready",
  running: "In round",
  paused: "Paused",
  time_called: "Time in round",
  overtime: "Overtime",
  overtime_expired: "Overtime over",
  complete: "Finished",
};

export function TimerPanel({
  timer,
  layout,
  now,
}: {
  timer: HubTimer;
  layout: ResolvedLayout;
  now: number;
}) {
  const profile = GAME_PROFILES[timer.game];
  const repeats = nameRepeatsGame(profile, timer.eventName);
  const phase = timerPhase(timer, now);
  const band = urgency(timer, now);
  const untimed = timer.durationSeconds === null;

  const left = remainingMs(timer, now);
  const up = elapsedMs(timer, now);
  const otLeft = overtimeRemainingMs(timer, now);

  /* Overtime borrows the game's own colour rather than the warning
     amber: at this point the panel is showing that game's procedure, and
     the accent is what ties the two together. */
  const inOvertime = phase === "overtime" || phase === "overtime_expired";

  const clock =
    inOvertime && otLeft !== null
      ? formatClock(otLeft)
      : untimed
        ? formatClock(up)
        : formatClock(left);

  return (
    <section
      /* The one place a game's colour is set. Everything below reads it
         from here, so a panel is never five hardcoded classes. */
      style={{ ["--game" as string]: `var(${profile.accentToken})` }}
      className={`relative flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-panel)] border-2 bg-surface ${
        inOvertime ? "border-[var(--game)]" : URGENCY_RING[band]
      }`}
      aria-label={`${profile.displayName}, ${timer.eventName}, ${PHASE_WORD[phase]}`}
    >
      {/* The game's rule. Thin on purpose — five panels of solid colour
          would stop looking like one product. */}
      <span aria-hidden="true" className="h-1.5 w-full shrink-0 bg-[var(--game)]" />

      <div className="flex min-h-0 flex-1 flex-col justify-between gap-2 p-[clamp(0.75rem,1.6vw,2rem)]">
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            {/*
             * One name, never the same one twice. A tournament called
             * "One Piece Card Game" under a heading that already says
             * ONE PIECE is the game's name printed on two lines, so in
             * that case the game becomes the heading and the second line
             * goes away entirely.
             */}
            {repeats ? (
              <h2
                className={`truncate font-bold text-[var(--game)] ${TITLE_SIZE[layout]}`}
              >
                {profile.displayName}
              </h2>
            ) : (
              <>
                <p
                  className={`truncate font-semibold tracking-[0.18em] text-[var(--game)] uppercase ${META_SIZE[layout]}`}
                >
                  {profile.shortName}
                </p>
                <h2
                  className={`truncate font-bold text-text-primary ${TITLE_SIZE[layout]}`}
                >
                  {timer.eventName}
                </h2>
              </>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1">
            {timer.round !== null && (
              <p
                className={`font-semibold text-text-secondary tabular-nums ${META_SIZE[layout]}`}
              >
                Round {timer.round}
              </p>
            )}
            {timer.format && (
              <p className={`text-text-muted ${META_SIZE[layout]}`}>{timer.format}</p>
            )}
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
          <p
            /* `role="timer"` and a spoken label, because the digits alone
               are a picture to a screen reader. Not a live region: an
               announcement every second would be unusable. */
            role="timer"
            aria-label={
              untimed
                ? `${PHASE_WORD[phase]}, untimed`
                : `${PHASE_WORD[phase]}, ${speakClock(inOvertime ? otLeft : left)}`
            }
            className={`font-mono leading-none font-bold tabular-nums ${
              CLOCK_SIZE[layout]
            } ${inOvertime ? "text-[var(--game)]" : URGENCY_DIGITS[band]}`}
          >
            {phase === "time_called" ? "0:00" : clock}
          </p>

          {untimed && phase !== "ready" && (
            <p className={`mt-2 text-text-muted ${META_SIZE[layout]}`}>Untimed round</p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3">
          <span
            className={`rounded-full px-3 py-1 font-semibold tracking-wide uppercase ${META_SIZE[layout]} ${
              phase === "paused"
                ? "bg-elevated text-text-secondary"
                : phase === "complete"
                  ? "bg-elevated text-text-muted"
                  : inOvertime || phase === "time_called"
                    ? "bg-[var(--game)] text-canvas"
                    : "bg-elevated text-text-secondary"
            }`}
          >
            {PHASE_WORD[phase]}
          </span>

          {/* The urgency band said in words as well as colour. */}
          {URGENCY_WORD[band] && phase === "running" && (
            <span
              className={`font-semibold ${META_SIZE[layout]} ${
                band === "one" ? "text-danger" : "text-warning"
              }`}
            >
              {URGENCY_WORD[band]}
            </span>
          )}
        </footer>
      </div>

      {showsOvertimeRules(timer, now) && (
        <OvertimeOverlay timer={timer} layout={layout} now={now} />
      )}
    </section>
  );
}

/**
 * The overtime procedure, over its own panel and nothing else.
 *
 * The rule that makes this feature work in a shop running two
 * tournaments: One Piece reaching zero must not put a rules card over
 * the Flesh and Blood timer, whose round has twenty minutes left. So
 * this is `absolute inset-0` inside the panel, never a page-level modal.
 */
function OvertimeOverlay({
  timer,
  layout,
  now,
}: {
  timer: HubTimer;
  layout: ResolvedLayout;
  now: number;
}) {
  const profile = GAME_PROFILES[timer.game];
  const procedure = procedureFor(profile, timer.bracket);
  const otLeft = overtimeRemainingMs(timer, now);
  const running = timer.status === "overtime";

  /* Tighter in a grid cell, because four panels on a 1080p television
     leave a procedure about six lines of room and a rule that scrolls
     off the bottom is a rule the room never sees. */
  const step =
    layout === "grid"
      ? "text-[clamp(0.62rem,0.82vw,0.85rem)] leading-snug"
      : layout === "split"
        ? "text-[clamp(0.8rem,1.15vw,1.15rem)]"
        : "text-[clamp(1rem,1.5vw,1.5rem)]";

  return (
    <div
      /* Animated in, but only for people who asked for animation. */
      /* Opaque, not a wash. A translucent card let the panel's own
         countdown ghost through underneath, which from across a room
         reads as a second clock disagreeing with the first. */
      className="absolute inset-0 flex flex-col gap-[clamp(0.3rem,0.7vw,0.85rem)] overflow-hidden rounded-[calc(var(--radius-panel)-2px)] bg-canvas p-[clamp(0.75rem,1.6vw,2rem)] motion-safe:animate-[cf-overtime-in_var(--duration-slow)_var(--ease-out-soft)]"
      role="status"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p
          className={`font-semibold tracking-[0.18em] text-[var(--game)] uppercase ${step}`}
        >
          {profile.shortName}
        </p>
        <p className={`font-semibold text-text-muted uppercase ${step}`}>
          {timer.bracket === "elimination" ? "Elimination" : "Swiss"}
        </p>
      </div>

      <div className="flex items-baseline justify-between gap-4">
        <h3
          className={`font-bold text-text-primary ${
            layout === "grid"
              ? "text-[clamp(0.95rem,1.35vw,1.25rem)]"
              : layout === "split"
                ? "text-[clamp(1.4rem,2.6vw,2.4rem)]"
                : "text-[clamp(2rem,4vw,4rem)]"
          }`}
        >
          TIME IN ROUND
        </h3>

        {/* The headline the room reads first: "+5 TURNS", "+3 TURNS · 5:00". */}
        <p
          className={`shrink-0 font-bold text-[var(--game)] ${
            layout === "grid"
              ? "text-[clamp(0.85rem,1.3vw,1.1rem)]"
              : "text-[clamp(1rem,2vw,2rem)]"
          }`}
        >
          {procedure.headline}
        </p>
      </div>

      {/* The countdown and the turn tracker share a row. Stacked, they
          cost enough height that a six-step procedure got clipped, and a
          procedure the room cannot finish reading is not a procedure.
          A countdown appears only where a publisher specifies one. */}
      {(running && otLeft !== null) || procedure.additionalTurns > 0 ? (
        <div className="flex items-center justify-between gap-3">
          {running && otLeft !== null ? (
            <p
              className={`font-mono leading-none font-bold text-[var(--game)] tabular-nums ${
                layout === "grid"
                  ? "text-[clamp(1.4rem,2.6vw,2.4rem)]"
                  : layout === "split"
                    ? "text-[clamp(1.8rem,3.6vw,3.6rem)]"
                    : "text-[clamp(2.5rem,6vw,6rem)]"
              }`}
            >
              {formatClock(otLeft)}
            </p>
          ) : (
            <span />
          )}

          {procedure.additionalTurns > 0 && (
            <TurnTracker
              turn={timer.overtimeTurn}
              total={procedure.additionalTurns}
              size={step}
            />
          )}
        </div>
      ) : null}

      <ol
        className={`flex min-h-0 flex-1 flex-col justify-start gap-[clamp(0.1rem,0.3vw,0.4rem)] overflow-hidden text-text-secondary ${step}`}
      >
        {procedure.steps.map((instruction, index) => (
          <li key={instruction} className="flex gap-2">
            <span className="shrink-0 font-bold text-[var(--game)] tabular-nums">
              {index + 1}.
            </span>
            <span className="min-w-0">{instruction}</span>
          </li>
        ))}
      </ol>

      {procedure.tiebreak && layout !== "grid" && (
        <p className={`text-text-muted ${step}`}>
          <span className="font-semibold text-text-secondary">Compare in order:</span>{" "}
          {procedure.tiebreak.join(" · ")}
        </p>
      )}

      {/* On every overlay, every time. CardFlare is not a rules authority
          and must never read as one. */}
      <p className="shrink-0 text-[clamp(0.6rem,0.75vw,0.8rem)] text-text-muted">
        {RULES_DISCLAIMER}
      </p>
    </div>
  );
}

/** Turn 2 of 3, as dots. Advanced by staff, never by a clock. */
function TurnTracker({
  turn,
  total,
  size,
}: {
  turn: number;
  total: number;
  size: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`font-semibold text-text-secondary ${size}`}>
        Turn {turn} of {total}
      </span>
      <span className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={`size-2.5 rounded-full ${
              index < turn ? "bg-[var(--game)]" : "bg-border-strong"
            }`}
          />
        ))}
      </span>
    </div>
  );
}
