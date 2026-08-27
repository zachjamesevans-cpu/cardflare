"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import {
  Bell,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Flag,
  Hand,
  Minus,
  MonitorUp,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Square,
  Timer as TimerIcon,
  Trash2,
  Zap,
  ZapOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/controls";
import {
  GAME_PROFILES,
  nameRepeatsGame,
  procedureFor,
  RULES_DISCLAIMER,
} from "@/lib/event-hub/game-profiles";
import {
  moveTimerAction,
  removeTimerAction,
  splitTimerAction,
  timerControlAction,
} from "@/lib/event-hub/actions";
import {
  extendAuto,
  holdAuto,
  intermissionFor,
  resumeAuto,
  setAutoMode,
  setIntermissionSeconds,
  startNextRound,
} from "@/lib/event-hub/auto-mode";
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
  setBeginnerMode,
  setRulesDismissed,
  showsOvertimeRules,
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

  const run = (
    timer: HubTimer,
    op: string,
    patch: TimerPatch | null,
    extra?: Record<string, string>,
  ) => {
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
    for (const [key, value] of Object.entries(extra ?? {})) data.set(key, value);
    startAction(() => void timerControlAction(data));
  };

  /* The organizer's "the round hit time" — a chime and a notification,
     without the television being involved at all. */
  useOrganizerAlert(timers, at);

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
          solo={timers.length === 1}
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
  solo,
  onRun,
}: {
  timer: HubTimer;
  now: number;
  first: boolean;
  last: boolean;
  /** Alone on its display: nothing to reorder, nothing to split off. */
  solo: boolean;
  onRun: (
    timer: HubTimer,
    op: string,
    patch: TimerPatch | null,
    extra?: Record<string, string>,
  ) => void;
}) {
  const profile = GAME_PROFILES[timer.game];
  const procedure = procedureFor(profile, timer.bracket);
  const phase = timerPhase(timer, now);
  /* Counts UP, matching the wall. */
  const otUp = overtimeElapsedMs(timer, now);
  const left = remainingMs(timer, now);

  const inOvertime = phase === "overtime" || phase === "overtime_expired";
  const atTime = phase === "time_called";

  const intermission = intermissionFor(timer, now);

  return (
    <section
      style={{ ["--game" as string]: `var(${profile.accentToken})` }}
      className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface"
    >
      <span aria-hidden="true" className="block h-1 w-full bg-[var(--game)]" />

      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-[var(--game)] uppercase">
              <span>
                {profile.shortName}
                {timer.bracket === "elimination" ? " · Elimination" : ""}
              </span>
              {/* The founder's indicator: "a small obvious status". */}
              {timer.autoMode && (
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-accent normal-case">
                  AUTO MODE ON
                </span>
              )}
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

        {/*
         * The between-rounds cockpit. The founder's spec is the layout:
         * the target, and three big escapes — HOLD, +2 MIN, START NOW —
         * "extremely easy ways to stop automation if reality does not
         * match the schedule." Never buried in settings.
         */}
        {intermission && (
          <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-accent/50 bg-elevated p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-accent">
                {intermission.state === "held"
                  ? "Auto Mode held"
                  : intermission.state === "blocked"
                    ? "Auto Mode held: still in overtime"
                    : intermission.state === "waiting"
                      ? `Round ${intermission.nextRound} waits for you`
                      : `Round ${intermission.nextRound} target`}
              </p>
              <p
                className="font-mono text-2xl font-bold text-text-primary tabular-nums"
                suppressHydrationWarning
              >
                {intermission.state === "counting" || intermission.state === "held"
                  ? formatClock(intermission.remainingMs)
                  : "0:00"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {intermission.state === "held" ? (
                <Control
                  label="Resume"
                  icon={Play}
                  variant="primary"
                  onClick={() => onRun(timer, "auto-resume", resumeAuto(timer, now))}
                />
              ) : intermission.state === "counting" ? (
                <Control
                  label="Hold next round"
                  icon={Hand}
                  onClick={() => onRun(timer, "auto-hold", holdAuto(timer, now))}
                />
              ) : null}

              <Control
                label="+2 min"
                icon={Plus}
                onClick={() => onRun(timer, "auto-extend", extendAuto(timer, now))}
              />

              <Control
                label="Start round now"
                icon={Play}
                /* Primary only when it is THE thing to press: at zero,
                   waiting on a person. While counting or held it stays
                   quiet — Resume is the held state's headline. */
                variant={
                  intermission.state === "waiting" || intermission.state === "blocked"
                    ? "primary"
                    : "secondary"
                }
                onClick={() =>
                  onRun(timer, "auto-start-now", startNextRound(timer, now))
                }
              />
            </div>

            {intermission.state === "blocked" && (
              <p className="text-xs text-text-secondary">
                The previous round is still in overtime, so the next one will not start
                itself. Start it when the table finishes, or add time.
              </p>
            )}
            {intermission.state === "waiting" && (
              <p className="text-xs text-text-secondary">
                {timer.autoStart
                  ? "The target passed while nothing was watching, so the round waited for you."
                  : "Auto-start is off for this tournament: the round starts when you press it."}
              </p>
            )}

            <NotificationOptIn />
          </div>
        )}

        {/* Transport. Big enough to hit without looking, because a staff
            member is watching the room, not the phone. During an Auto
            Mode intermission the row keeps only the judge tools: a
            second green Start beside "Start round now" would relaunch
            the SAME round, and time is already called. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {!intermission &&
            (phase === "running" ? (
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
            ))}

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
          {!intermission && (
            <Control
              label="Call time"
              icon={Flag}
              onClick={() => onRun(timer, "call-time", callTime(timer, now))}
            />
          )}
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

              {/* The rules card is opt-in — the founder: "default to
                  not showing them". Beginner mode is the opt-in, and
                  the in-the-moment hide only exists once it is on. A
                  full row on a phone, because its label is the longest
                  in the grid. */}
              <div className="col-span-2 sm:col-span-1">
                <Control
                  label={
                    timer.beginnerMode ? "Beginner mode is on" : "Beginner mode is off"
                  }
                  icon={timer.beginnerMode ? Eye : EyeOff}
                  onClick={() =>
                    timer.beginnerMode
                      ? onRun(timer, "beginner-off", setBeginnerMode(timer, false))
                      : onRun(timer, "beginner-on", setBeginnerMode(timer, true))
                  }
                />
              </div>

              {timer.beginnerMode && (
                <Control
                  label={
                    timer.rulesDismissed ? "Show the rules again" : "Hide the rules"
                  }
                  icon={timer.rulesDismissed ? Eye : EyeOff}
                  onClick={() =>
                    timer.rulesDismissed
                      ? onRun(timer, "reopen-rules", setRulesDismissed(timer, false))
                      : onRun(timer, "dismiss-rules", setRulesDismissed(timer, true))
                  }
                />
              )}

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
                !intermission && showsOvertimeRules(timer, now)
                  ? "text-[var(--game)]"
                  : "text-text-muted"
              }`}
            >
              {/* An Auto Mode intermission replaces the time face
                  entirely, so claiming the rules card is up would be a
                  lie about the wall. */}
              {intermission
                ? "The display is on the between-rounds screen."
                : showsOvertimeRules(timer, now)
                  ? "Rules are on the display now."
                  : timer.beginnerMode
                    ? "Rules hidden. The display shows the timer."
                    : "The display shows the clock, in red. Beginner mode adds the rules card."}
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

        {/*
         * Auto Mode, at rest: the switch and the one number it needs.
         * A sentence rather than a panel — the founder: "Do not clutter
         * the controller with explanation text."
         */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              timer.autoMode
                ? onRun(timer, "auto-off", setAutoMode(timer, false))
                : onRun(timer, "auto-on", setAutoMode(timer, true))
            }
          >
            {timer.autoMode ? (
              <Zap className="size-4 text-accent" aria-hidden="true" />
            ) : (
              <ZapOff className="size-4" aria-hidden="true" />
            )}
            {timer.autoMode ? "Auto Mode on" : "Auto Mode off"}
          </Button>

          {timer.autoMode && (
            <>
              <label htmlFor={`intermission-${timer.id}`} className="sr-only">
                Break between rounds
              </label>
              <Select
                id={`intermission-${timer.id}`}
                value={String(timer.intermissionSeconds)}
                onChange={(event) => {
                  const seconds = Number(event.target.value);
                  /* With an optimistic patch, so the select does not
                     visibly snap back while the round trip runs. */
                  onRun(
                    timer,
                    "auto-intermission",
                    setIntermissionSeconds(timer, seconds),
                    { intermissionChoice: String(seconds / 60) },
                  );
                }}
                className="w-auto text-sm"
              >
                <option value="120">2 min break</option>
                <option value="180">3 min break</option>
                <option value="300">5 min break</option>
                {![120, 180, 300].includes(timer.intermissionSeconds) && (
                  <option value={String(timer.intermissionSeconds)}>
                    {Math.round(timer.intermissionSeconds / 60)} min break
                  </option>
                )}
              </Select>

              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  timer.autoStart
                    ? onRun(timer, "auto-start-off", { autoStart: false })
                    : onRun(timer, "auto-start-on", { autoStart: true })
                }
              >
                {timer.autoStart ? "Starts rounds itself" : "Waits at zero"}
              </Button>
            </>
          )}
        </div>

        {/* Housekeeping, kept away from the controls used mid-round.
            A two-column grid on a phone — the free-wrapping row read
            as "quite bad" on the founder's screen — and a plain row
            once there is width for one. */}
        <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 sm:flex sm:flex-wrap sm:items-center">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center sm:w-auto"
            onClick={() => onRun(timer, "reset", reset(timer))}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Reset
          </Button>

          {/* Reorder only means something with a neighbour to swap. */}
          {!solo && (
            <>
              <form action={moveTimerAction} className="w-full sm:w-auto">
                <input type="hidden" name="timerId" value={timer.id} />
                <input type="hidden" name="direction" value="up" />
                <Button
                  variant="ghost"
                  size="sm"
                  type="submit"
                  disabled={first}
                  className="w-full justify-center sm:w-auto"
                >
                  <ChevronUp className="size-4" aria-hidden="true" />
                  Move up
                </Button>
              </form>

              <form action={moveTimerAction} className="w-full sm:w-auto">
                <input type="hidden" name="timerId" value={timer.id} />
                <input type="hidden" name="direction" value="down" />
                <Button
                  variant="ghost"
                  size="sm"
                  type="submit"
                  disabled={last}
                  className="w-full justify-center sm:w-auto"
                >
                  <ChevronDown className="size-4" aria-hidden="true" />
                  Move down
                </Button>
              </form>

              {/* One press, one television. The tournament moves to a
                  new screen further down this page, link and all, and
                  that screen's QR scans players in game-scoped. Hidden
                  for a timer already alone on its screen. */}
              <form action={splitTimerAction} className="w-full sm:w-auto">
                <input type="hidden" name="timerId" value={timer.id} />
                <Button
                  variant="ghost"
                  size="sm"
                  type="submit"
                  className="w-full justify-center sm:w-auto"
                >
                  <MonitorUp className="size-4" aria-hidden="true" />
                  Its own screen
                </Button>
              </form>
            </>
          )}

          <form action={removeTimerAction} className="w-full sm:ml-auto sm:w-auto">
            <input type="hidden" name="timerId" value={timer.id} />
            <Button
              variant="ghost"
              size="sm"
              type="submit"
              className="w-full justify-center sm:w-auto"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              End tournament
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}

/**
 * The organizer's "the round hit time", on the device in their hand.
 *
 * Watches every Auto Mode tournament for the transition into time and
 * fires once per round: a short chime, and a browser notification when
 * they have allowed one. Neither is required for Auto Mode to work —
 * the intermission section appearing IS the visual alert — and neither
 * can fire on page load, because a phone opened mid-intermission has
 * nothing new to announce.
 */
function useOrganizerAlert(timers: HubTimer[], now: number) {
  const seen = useRef(new Map<string, boolean>());
  const audio = useRef<AudioContext | null>(null);

  /* Browsers refuse audio before a gesture. The organizer taps this
     panel constantly, so the first tap quietly unlocks the chime. */
  useEffect(() => {
    const open = () => {
      try {
        audio.current ??= new AudioContext();
        void audio.current.resume();
      } catch {
        /* No audio on this device. The visual alert still works. */
      }
    };

    window.addEventListener("pointerdown", open, { once: true });
    return () => window.removeEventListener("pointerdown", open);
  }, []);

  useEffect(
    () => () => {
      void audio.current?.close().catch(() => {});
      audio.current = null;
    },
    [],
  );

  useEffect(() => {
    for (const timer of timers) {
      const phase = timerPhase(timer, now);
      const atTime =
        phase === "time_called" || phase === "overtime" || phase === "overtime_expired";

      const was = seen.current.get(timer.id);
      seen.current.set(timer.id, atTime);

      /* Only the TRANSITION, and only for Auto Mode tournaments: a page
         opened during time (was === undefined) stays quiet. */
      if (!timer.autoMode || was !== false || !atTime) continue;

      organizerChime(audio.current);

      try {
        if ("Notification" in window && Notification.permission === "granted") {
          const profile = GAME_PROFILES[timer.game];
          new Notification(`${profile.shortName}: time in round`, {
            body: `Auto Mode is counting down ${formatClock(
              timer.intermissionSeconds * 1000,
            )} to round ${Math.min(99, (timer.round ?? 1) + 1)}. Post pairings when ready.`,
            tag: `cardflare-auto-${timer.id}`,
          });
        }
      } catch {
        /* Denied, unsupported, or a webview. The chime already fired. */
      }
    }
  }, [timers, now]);
}

/** Two rising blips — noticeable across a counter, never a klaxon. */
function organizerChime(context: AudioContext | null) {
  if (!context || context.state !== "running") return;

  for (const [index, frequency] of [660, 990].entries()) {
    const at = context.currentTime + index * 0.28;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.1, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);

    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.26);
  }
}

/**
 * The one-tap opt-in for browser notifications, shown only while the
 * browser is still waiting to be asked. Auto Mode never depends on it.
 */
function NotificationOptIn() {
  /*
   * Read as an external store: the server snapshot says "unsupported"
   * (it cannot know this browser), the client snapshot reads the real
   * permission, and React reconciles the two without a hydration lie.
   * Granting or denying re-renders via the bump below — the Permissions
   * API has no portable change event worth subscribing to here.
   */
  const [, bump] = useState(0);
  const permission = useSyncExternalStore(
    () => () => {},
    () =>
      typeof Notification === "undefined" ? "unsupported" : Notification.permission,
    () => "unsupported",
  );

  if (permission !== "default") return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-fit"
      onClick={() => {
        void Notification.requestPermission().then(() => bump((n) => n + 1));
      }}
    >
      <Bell className="size-4" aria-hidden="true" />
      Notify this device when time hits
    </Button>
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
      {/* Wraps rather than truncates: "Beginner mode is off" cut to
          "Begi…" on a phone is a button nobody can read, and these sit
          two to a row on exactly that screen. */}
      <span className="text-left leading-tight whitespace-normal">{label}</span>
    </Button>
  );
}
