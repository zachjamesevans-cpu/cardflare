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
  overtimeCapMs,
  overtimeElapsedMs,
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

/**
 * The game's own name, and the biggest thing on the panel after the
 * clock.
 *
 * The founder, looking at a wall from across a shop: "the game name
 * should be much bigger font, should take up pretty much the entire top
 * of the tournament widget. There's a lot of open space there."
 *
 * He is right about the space and right about the priority. Somebody
 * walking in reads WHICH TOURNAMENT before they read how long is left —
 * the clock only means something once you know whose it is — and the old
 * header spent its top line on a caption while the name of the game sat
 * in eleven-pixel tracking above it.
 *
 * `shortName` rather than `displayName`, because this is exactly the job
 * the short name exists for: "One Piece" reads at forty feet, "One Piece
 * Card Game" wraps.
 */
const GAME_SIZE: Record<ResolvedLayout, string> = {
  single: "text-[clamp(2.75rem,8.5vw,9.5rem)]",
  split: "text-[clamp(1.75rem,4.6vw,5rem)]",
  grid: "text-[clamp(1rem,2.4vw,2.4rem)]",
};

/**
 * The game's name on the rules card.
 *
 * Smaller than the panel's own headline, because TIME IN ROUND has to
 * lead once the round is over — but far bigger than a caption, so a
 * shop running four tournaments can still tell at a glance whose rules
 * these are.
 */
const OVERLAY_GAME_SIZE: Record<ResolvedLayout, string> = {
  single: "text-[clamp(1.5rem,3vw,3rem)]",
  split: "text-[clamp(1.1rem,2vw,2rem)]",
  grid: "text-[clamp(0.8rem,1.2vw,1.15rem)]",
};

/**
 * The round number, which is the other thing read from a distance.
 *
 * Bigger than the rest of the small print and smaller than the game, so
 * the top of the panel reads as one line with a number on the end of it
 * rather than as two competing headings.
 */
const ROUND_SIZE: Record<ResolvedLayout, string> = {
  single: "text-[clamp(1.1rem,2.2vw,2.2rem)]",
  split: "text-[clamp(0.9rem,1.5vw,1.5rem)]",
  grid: "text-[clamp(0.75rem,1.05vw,1rem)]",
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
  /* Extra time counts UP toward its cap — the founder: "count UP to
     5:00 for one piece and other TCG's instead of counting down." */
  const otUp = overtimeElapsedMs(timer, now);

  /* Overtime borrows the game's own colour rather than the warning
     amber: at this point the panel is showing that game's procedure, and
     the accent is what ties the two together. */
  const inOvertime = phase === "overtime" || phase === "overtime_expired";

  const clock =
    inOvertime && otUp !== null
      ? formatClock(otUp)
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
        <header className="flex items-baseline justify-between gap-4">
          <div className="flex min-w-0 flex-col">
            {/* The game, at the size somebody reads from the door. */}
            <h2
              className={`truncate font-bold tracking-tight text-[var(--game)] uppercase ${GAME_SIZE[layout]} leading-none`}
            >
              {profile.shortName}
            </h2>

            {/*
             * And what this particular tournament is called, under it —
             * unless that is the game's name again, in which case the
             * heading above has already said it and a second line would
             * be the same words twice.
             */}
            {!repeats && (
              <p
                className={`truncate pt-1 font-semibold text-text-secondary ${META_SIZE[layout]}`}
              >
                {timer.eventName}
              </p>
            )}
          </div>

          {/* Baseline-aligned with the game name, so the top of the panel
              reads as one line rather than two stacked corners. */}
          <div className="flex shrink-0 items-baseline gap-3">
            {timer.format && (
              <p className={`text-text-muted ${META_SIZE[layout]}`}>{timer.format}</p>
            )}
            {timer.round !== null && (
              <p
                className={`font-semibold text-text-secondary tabular-nums ${ROUND_SIZE[layout]}`}
              >
                Round {timer.round}
              </p>
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
                : inOvertime
                  ? `${PHASE_WORD[phase]}, ${formatClock(otUp)} elapsed`
                  : `${PHASE_WORD[phase]}, ${speakClock(left)}`
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
  const phase = timerPhase(timer, now);
  const inOvertime = phase === "overtime" || phase === "overtime_expired";
  const otUp = overtimeElapsedMs(timer, now);
  const otCap = overtimeCapMs(timer, now);

  /*
   * Two shapes of card. During EXTRA TIME the founder's instruction is
   * the layout: "it's just showing tiebreakers in order explained
   * quickly" — a count-up clock, the turn tracker, one instruction
   * line, the tiebreakers. The full step-by-step procedure belongs to
   * TIME IN ROUND on the turn-counted games (and a manual early call),
   * where the steps ARE the whole answer.
   */
  const compact = inOvertime && (procedure.tiebreak?.length ?? 0) > 0;

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
      {/* The game keeps its size here too. Covering the panel's headline
          with a caption would mean the one moment a room most needs to
          know WHICH tournament is the moment it stops saying. */}
      <div className="flex items-baseline justify-between gap-3">
        <p
          className={`truncate font-bold tracking-tight text-[var(--game)] uppercase ${OVERLAY_GAME_SIZE[layout]} leading-none`}
        >
          {profile.shortName}
        </p>
        <p className={`shrink-0 font-semibold text-text-muted uppercase ${step}`}>
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
          {phase === "overtime_expired"
            ? "EXTRA TIME OVER"
            : inOvertime
              ? "EXTRA TIME"
              : "TIME IN ROUND"}
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

      {/* The clock and the turn tracker share a row. Stacked, they cost
          enough height that a six-step procedure got clipped, and a
          procedure the room cannot finish reading is not a procedure.
          The clock counts UP and appears only where a publisher
          specifies extra time. */}
      {(inOvertime && otUp !== null && otCap !== null) ||
      procedure.additionalTurns > 0 ? (
        <div className="flex items-baseline justify-between gap-3">
          {inOvertime && otUp !== null && otCap !== null ? (
            <p
              className={`font-mono leading-none font-bold text-[var(--game)] tabular-nums ${
                layout === "grid"
                  ? "text-[clamp(1.4rem,2.6vw,2.4rem)]"
                  : layout === "split"
                    ? "text-[clamp(1.8rem,3.6vw,3.6rem)]"
                    : "text-[clamp(2.5rem,6vw,6rem)]"
              }`}
            >
              {formatClock(otUp)}
              <span
                className={`text-text-muted ${
                  layout === "grid"
                    ? "text-[clamp(0.75rem,1.2vw,1.1rem)]"
                    : layout === "split"
                      ? "text-[clamp(0.95rem,1.6vw,1.6rem)]"
                      : "text-[clamp(1.2rem,2.4vw,2.4rem)]"
                }`}
              >
                {" "}
                / {formatClock(otCap)}
              </span>
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

      {compact ? (
        /* Extra time: the tiebreakers, in order, and nothing slower. */
        <div
          className={`flex min-h-0 flex-1 flex-col justify-start gap-[clamp(0.1rem,0.3vw,0.4rem)] overflow-hidden ${step}`}
        >
          {procedure.extraTimeLine && (
            <p className="text-text-secondary">{procedure.extraTimeLine}</p>
          )}
          <ol className="flex flex-col gap-[clamp(0.1rem,0.3vw,0.4rem)] text-text-primary">
            {(procedure.tiebreak ?? []).map((rule, index) => (
              <li key={rule} className="flex gap-2 font-semibold">
                <span className="shrink-0 font-bold text-[var(--game)] tabular-nums">
                  {index + 1}.
                </span>
                <span className="min-w-0">{rule}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <>
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
              <span className="font-semibold text-text-secondary">
                Compare in order:
              </span>{" "}
              {procedure.tiebreak.join(" · ")}
            </p>
          )}
        </>
      )}

      {/* On every overlay, every time. cardflare is not a rules authority
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
