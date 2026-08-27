"use client";

import { useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Flag,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Square,
  Timer as TimerIcon,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  GAME_PROFILES,
  nameRepeatsGame,
  procedureFor,
  RULES_DISCLAIMER,
} from "@/lib/event-hub/game-profiles";
import {
  moveTimerAction,
  removeTimerAction,
  timerControlAction,
} from "@/lib/event-hub/actions";
import type { DisplayPayload } from "@/lib/event-hub/display-payload";
import {
  advanceTurn,
  adjust,
  callTime,
  complete,
  formatClock,
  impliedOvertimeMs,
  overtimeElapsedMs,
  pause,
  remainingMs,
  reset,
  setRulesDismissed,
  start,
  startOvertime,
  timerPhase,
  type HubTimer,
  type TimerPatch,
} from "@/lib/event-hub/timer";
import { useDisplayClock } from "./display-clock";

/**
 * The control panel, on whatever a staff member has in their hand.
 *
 * Phone-first, because the actual job is standing behind a counter with
 * a television across the room: start the round, add a minute for a
 * judge call, call time, start overtime, advance a turn. Every control
 * here is a full-height button rather than a dense toolbar, and none of
 * them are on the public display.
 *
 * TWO THINGS MAKE THIS FEEL LIVE.
 *
 * It reads the same polled payload the television does, so a second
 * staff phone's pause shows up here within a few seconds without either
 * device knowing about the other.
 *
 * And every tap applies its own transition locally first, using the same
 * pure functions the server will run, so the button responds now rather
 * than after a round trip on shop wifi. The override is dropped the
 * moment a poll comes back newer than it — the server is always the
 * authority, this just stops the wait being visible.
 */
/** How long an unconfirmed guess may stand. Two polls of the display. */
const GUESS_MS = 6_000;

export function ControlPanel({
  initial,
  token,
}: {
  initial: DisplayPayload;
  token: string;
}) {
  const { payload, now: at } = useDisplayClock(initial, token);
  const [, startAction] = useTransition();

  /*
   * What we believe about a timer we just changed, and when we started
   * believing it. Held as state rather than a ref because it is read
   * while rendering, and a ref read during render is a value React is
   * entitled to disagree with.
   */
  const [guesses, setGuesses] = useState<
    Record<string, { timer: HubTimer; at: number }>
  >({});

  const timers = payload.timers.map((server) => {
    const guess = guesses[server.id];
    if (!guess) return server;

    /* The server has spoken since we guessed. Its answer wins — it
       always does; this only ever hides the round trip. */
    if (Date.parse(server.updatedAt) >= guess.at) return server;

    /*
     * And a backstop, because a guess that never clears is worse than no
     * guess at all: if the write failed, or was a no-op the server
     * declined to make, the panel would otherwise show a state the wall
     * does not have, indefinitely. Two polls is long enough to hide the
     * round trip and short enough that a lie is brief.
     */
    if (at - guess.at > GUESS_MS) return server;

    return guess.timer;
  });

  const run = (timer: HubTimer, op: string, patch: TimerPatch | null) => {
    if (patch) {
      /*
       * Stamped with the SERVER-corrected clock, not this device's.
       * Comparing a phone's `Date.now()` against a server's `updated_at`
       * is comparing two clocks that disagree, and on a phone running
       * fast the guess would outlive every answer the server gave.
       */
      const stamp = at;
      setGuesses((current) => ({
        ...current,
        [timer.id]: {
          timer: { ...timer, ...patch, updatedAt: new Date(stamp).toISOString() },
          at: stamp,
        },
      }));
    }

    const data = new FormData();
    data.set("timerId", timer.id);
    data.set("op", op);
    startAction(() => void timerControlAction(data));
  };

  if (timers.length === 0) {
    return (
      <p className="rounded-[var(--radius-card)] border border-dashed border-border p-6 text-center text-text-secondary">
        No tournaments on this display yet. Add one below and it appears on the
        television straight away.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {timers.map((timer, index) => (
        <TimerCard
          key={timer.id}
          timer={timer}
          now={at}
          first={index === 0}
          last={index === timers.length - 1}
          onRun={run}
        />
      ))}
    </div>
  );
}

function TimerCard({
  timer,
  now,
  first,
  last,
  onRun,
}: {
  timer: HubTimer;
  now: number;
  first: boolean;
  last: boolean;
  onRun: (timer: HubTimer, op: string, patch: TimerPatch | null) => void;
}) {
  const profile = GAME_PROFILES[timer.game];
  const procedure = procedureFor(profile, timer.bracket);
  const phase = timerPhase(timer, now);
  /* Counts UP, matching the wall. */
  const otUp = overtimeElapsedMs(timer, now);
  const left = remainingMs(timer, now);

  const inOvertime = phase === "overtime" || phase === "overtime_expired";
  const atTime = phase === "time_called";

  return (
    <section
      style={{ ["--game" as string]: `var(${profile.accentToken})` }}
      className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface"
    >
      <span aria-hidden="true" className="block h-1 w-full bg-[var(--game)]" />

      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <p className="text-xs font-semibold tracking-[0.16em] text-[var(--game)] uppercase">
              {profile.shortName}
              {timer.bracket === "elimination" ? " · Elimination" : ""}
            </p>
            {/* The same rule the wall follows: a tournament named after
                its own game does not get the name printed twice. */}
            {!nameRepeatsGame(profile, timer.eventName) && (
              <h3 className="truncate text-lg font-bold text-text-primary">
                {timer.eventName}
              </h3>
            )}
            <p className="text-sm text-text-muted">
              {timer.round !== null ? `Round ${timer.round}` : "No round set"}
              {timer.format ? ` · ${timer.format}` : ""}
            </p>
          </div>

          <p className="shrink-0 font-mono text-3xl font-bold text-text-primary tabular-nums">
            {inOvertime && otUp !== null
              ? formatClock(otUp)
              : timer.durationSeconds === null
                ? "--:--"
                : formatClock(left)}
          </p>
        </div>

        {/* Transport. Big enough to hit without looking, because a staff
            member is watching the room, not the phone. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {phase === "running" ? (
            <Control
              label="Pause"
              icon={Pause}
              onClick={() => onRun(timer, "pause", pause(timer, now))}
            />
          ) : (
            <Control
              label={phase === "paused" ? "Resume" : "Start"}
              icon={Play}
              variant="primary"
              onClick={() => onRun(timer, "start", start(timer, now))}
            />
          )}

          <Control
            label="+1 min"
            icon={Plus}
            onClick={() => onRun(timer, "add-minute", adjust(timer, 60_000, now))}
          />
          <Control
            label="−1 min"
            icon={Minus}
            onClick={() => onRun(timer, "subtract-minute", adjust(timer, -60_000, now))}
          />
          <Control
            label="Call time"
            icon={Flag}
            onClick={() => onRun(timer, "call-time", callTime(timer, now))}
          />
        </div>

        {/* Overtime, only once there is a reason for it. */}
        {(atTime || inOvertime) && (
          <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-[var(--game)]/40 bg-elevated p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-[var(--game)]">
                {procedure.headline}
              </p>
              <p className="text-xs text-text-muted">
                {timer.bracket === "elimination" ? "Elimination" : "Swiss"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {!inOvertime && (
                <Control
                  label={
                    impliedOvertimeMs(timer) !== null
                      ? `Start ${formatClock(impliedOvertimeMs(timer))} overtime`
                      : "Start overtime"
                  }
                  icon={TimerIcon}
                  variant="primary"
                  onClick={() => {
                    const impliedMs = impliedOvertimeMs(timer);
                    onRun(
                      timer,
                      "start-overtime",
                      startOvertime(
                        timer,
                        now,
                        impliedMs === null ? null : impliedMs / 1000,
                      ),
                    );
                  }}
                />
              )}

              {procedure.additionalTurns > 0 && (
                <>
                  <Control
                    label={`Next turn (${timer.overtimeTurn}/${procedure.additionalTurns})`}
                    icon={ChevronUp}
                    onClick={() =>
                      onRun(
                        timer,
                        "next-turn",
                        advanceTurn(timer, procedure.additionalTurns, 1, now),
                      )
                    }
                  />
                  {/* Both directions. A turn counted by mistake has to be
                      takeable back, or staff stop touching the tracker. */}
                  <Control
                    label="Previous turn"
                    icon={ChevronDown}
                    onClick={() =>
                      onRun(
                        timer,
                        "previous-turn",
                        advanceTurn(timer, procedure.additionalTurns, -1, now),
                      )
                    }
                  />
                </>
              )}

              <Control
                label={timer.rulesDismissed ? "Show the rules again" : "Hide the rules"}
                icon={timer.rulesDismissed ? Eye : EyeOff}
                onClick={() =>
                  timer.rulesDismissed
                    ? onRun(timer, "reopen-rules", setRulesDismissed(timer, false))
                    : onRun(timer, "dismiss-rules", setRulesDismissed(timer, true))
                }
              />

              <Control
                label="Mark complete"
                icon={Square}
                onClick={() => onRun(timer, "complete", complete(timer))}
              />
            </div>

            {/*
             * What the television is doing, in words.
             *
             * Hiding the rules changed nothing a staff member could see on
             * this screen — the block stayed, the buttons stayed, and only
             * a label moved — so the button read as broken even when it had
             * worked. The wall's state belongs on the device driving it.
             */}
            <p
              className={`text-xs font-semibold ${
                timer.rulesDismissed ? "text-text-muted" : "text-[var(--game)]"
              }`}
            >
              {timer.rulesDismissed
                ? "Rules hidden. The display shows the timer."
                : "Rules are on the display now."}
            </p>

            <p className="text-xs text-text-muted">{RULES_DISCLAIMER}</p>

            <a
              href={profile.officialRulesUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs font-semibold text-accent hover:underline"
            >
              View official rules ({profile.displayName}) &mdash; last checked{" "}
              {profile.rulesLastVerified}
            </a>
          </div>
        )}

        {/* Housekeeping, kept away from the controls used mid-round. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRun(timer, "reset", reset(timer))}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Reset
          </Button>

          <form action={moveTimerAction}>
            <input type="hidden" name="timerId" value={timer.id} />
            <input type="hidden" name="direction" value="up" />
            <Button variant="ghost" size="sm" type="submit" disabled={first}>
              <ChevronUp className="size-4" aria-hidden="true" />
              Move up
            </Button>
          </form>

          <form action={moveTimerAction}>
            <input type="hidden" name="timerId" value={timer.id} />
            <input type="hidden" name="direction" value="down" />
            <Button variant="ghost" size="sm" type="submit" disabled={last}>
              <ChevronDown className="size-4" aria-hidden="true" />
              Move down
            </Button>
          </form>

          <form action={removeTimerAction} className="ml-auto">
            <input type="hidden" name="timerId" value={timer.id} />
            <Button variant="ghost" size="sm" type="submit">
              <Trash2 className="size-4" aria-hidden="true" />
              End tournament
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}

/** A control big enough for a thumb, with the icon never carrying meaning alone. */
function Control({
  label,
  icon: Icon,
  variant = "secondary",
  onClick,
}: {
  label: string;
  icon: typeof Play;
  variant?: "primary" | "secondary";
  onClick: () => void;
}) {
  return (
    <Button variant={variant} size="lg" onClick={onClick} className="w-full">
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Button>
  );
}
