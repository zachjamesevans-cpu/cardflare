import {
  GAME_PROFILES,
  procedureFor,
  timerPreset,
  type Bracket,
  type GameId,
} from "./game-profiles";

/**
 * The timer, as arithmetic on timestamps.
 *
 * Nothing in this file touches a database and nothing here runs on an
 * interval. That is the whole design: a countdown written to Postgres
 * once a second would be four writes a second on a busy Friday, would
 * drift the moment a shop's wifi hiccupped, and would reset itself every
 * time somebody refreshed the television. Instead the row holds only
 * what a person decided — started at this instant, paused with this much
 * left — and every client works out the rest from its own clock.
 *
 * That makes the poll cadence a question about how fast a PAUSE reaches
 * the television, not about whether the number on the wall is right. A
 * display that has not heard from the server in a minute is still
 * counting down correctly.
 *
 * Free of server-only imports, so the same functions run in the store's
 * browser, on the television, and in tests.
 */

/** What staff last decided. Not what the wall shows — see `timerPhase`. */
export type TimerStatus =
  "ready" | "running" | "paused" | "time_called" | "overtime" | "complete";

export const TIMER_STATUSES: readonly TimerStatus[] = [
  "ready",
  "running",
  "paused",
  "time_called",
  "overtime",
  "complete",
];

/**
 * What the wall shows.
 *
 * Distinct from `TimerStatus` for one reason that matters on a shop
 * floor: regulation reaching zero must put TIME IN ROUND on the
 * television at the instant it happens, whether or not anybody's phone
 * is awake to write a row. So a running timer with nothing left is
 * derived as `time_called`, and staff confirming it merely persists what
 * every screen already agreed on.
 */
export type TimerPhase = TimerStatus | "overtime_expired";

/** How loud the panel should be. Bands, not a gradient. */
export type Urgency = "none" | "ten" | "five" | "one";

/** The persisted timer, camel-cased. One row of `event_hub_timers`. */
export interface HubTimer {
  id: string;
  /** Which television it belongs to. Carried so authorisation can walk up. */
  displayId: string;
  position: number;
  game: GameId;
  eventName: string;
  /** The round number staff typed. Null while they have not. */
  round: number | null;
  format: string | null;
  bracket: Bracket;
  presetId: string;
  /** Regulation length. Null is a deliberate "untimed", not a missing value. */
  durationSeconds: number | null;
  status: TimerStatus;
  startedAt: string | null;
  pausedAt: string | null;
  remainingMsWhenPaused: number | null;
  overtimeStartedAt: string | null;
  /** Null in overtime means the procedure counts turns, not seconds. */
  overtimeDurationSeconds: number | null;
  overtimeTurn: number;
  rulesDismissed: boolean;
  /**
   * Whether the procedure card appears at time at all.
   *
   * Off by default — the founder: "Stop displaying the rules, and
   * maybe just have a 'beginner' mode toggle which does show the rules
   * for people if it goes to time." The wall's default face for
   * overtime is the clock itself, counting up in red.
   */
  beginnerMode: boolean;
  updatedAt: string;
}

/** A partial row a transition wants written. Null means "no change". */
export type TimerPatch = Partial<
  Pick<
    HubTimer,
    | "status"
    | "startedAt"
    | "pausedAt"
    | "remainingMsWhenPaused"
    | "overtimeStartedAt"
    | "overtimeDurationSeconds"
    | "overtimeTurn"
    | "rulesDismissed"
    | "beginnerMode"
    | "durationSeconds"
  >
>;

const MINUTE_MS = 60_000;

function stamp(iso: string | null): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

/**
 * Regulation time left, in milliseconds.
 *
 * Null for an untimed round — Lorcana single elimination and Riftbound
 * playoffs are genuinely untimed, and returning zero would draw them as
 * finished.
 */
export function remainingMs(timer: HubTimer, now: number): number | null {
  if (timer.durationSeconds === null) return null;

  const full = timer.durationSeconds * 1000;

  switch (timer.status) {
    case "ready":
      return full;
    case "paused":
      return Math.max(0, timer.remainingMsWhenPaused ?? full);
    case "running": {
      const started = stamp(timer.startedAt);
      /* A running row with no start stamp cannot happen through the
         actions, but a hand-edited row must not render NaN on a wall. */
      if (started === null) return full;
      return Math.max(0, full - (now - started));
    }
    case "time_called":
    case "overtime":
    case "complete":
      return 0;
  }
}

/**
 * The extra time this round's procedure implies, in ms.
 *
 * The preset speaks first because it is more specific — One Piece Top
 * Cut runs 10:00 where the store procedure says 5:00, and a preset that
 * deliberately carries null (Pokémon prerelease: "follow your event's
 * own end-of-round rules") means NO clock, not "borrow the
 * championship's". Null everywhere the game counts turns instead.
 */
export function impliedOvertimeMs(timer: HubTimer): number | null {
  const procedure = procedureFor(GAME_PROFILES[timer.game], timer.bracket);
  if (!procedure.timed) return null;

  const preset = timerPreset(timer.game, timer.presetId);
  const seconds = preset ? preset.overtimeSeconds : procedure.overtimeSeconds;
  return seconds === null ? null : seconds * 1000;
}

/** The instant regulation ended, for a row that carries a start stamp. */
function regulationEndAt(timer: HubTimer): number | null {
  if (timer.durationSeconds === null) return null;
  const started = stamp(timer.startedAt);
  if (started === null) return null;
  return started + timer.durationSeconds * 1000;
}

/**
 * What the extra-time clock is climbing toward, in ms.
 *
 * From the row when staff started overtime by hand; implied by the
 * procedure when regulation rolled straight over. Null means there is
 * no clock — the procedure counts turns.
 */
export function overtimeCapMs(timer: HubTimer, now: number): number | null {
  if (timer.status === "overtime") {
    return timer.overtimeDurationSeconds === null
      ? null
      : timer.overtimeDurationSeconds * 1000;
  }

  if (timer.status === "running") {
    const left = remainingMs(timer, now);
    if (left !== null && left <= 0) return impliedOvertimeMs(timer);
  }

  return null;
}

/**
 * Extra time, counting UP.
 *
 * The founder, running real rounds: "count UP to 5:00 for one piece and
 * other TCG's instead of counting down." Up is how a judge reads extra
 * time — it answers "how far into it are we" — and clamping at the cap
 * means the wall settles on 5:00 rather than ticking into nonsense.
 */
export function overtimeElapsedMs(timer: HubTimer, now: number): number | null {
  const cap = overtimeCapMs(timer, now);
  if (cap === null) return null;

  if (timer.status === "overtime") {
    const started = stamp(timer.overtimeStartedAt);
    return started === null ? 0 : Math.min(cap, Math.max(0, now - started));
  }

  const end = regulationEndAt(timer);
  return end === null ? 0 : Math.min(cap, Math.max(0, now - end));
}

/** Overtime left, or null when the procedure counts turns instead. */
export function overtimeRemainingMs(timer: HubTimer, now: number): number | null {
  const cap = overtimeCapMs(timer, now);
  const up = overtimeElapsedMs(timer, now);
  return cap === null || up === null ? null : Math.max(0, cap - up);
}

/**
 * How long an untimed round has been going.
 *
 * An untimed round still wants a number on the wall — players ask "how
 * long have we been at this" — it just counts the other way.
 */
export function elapsedMs(timer: HubTimer, now: number): number | null {
  if (timer.durationSeconds !== null) return null;

  const started = stamp(timer.startedAt);
  if (timer.status === "ready" || started === null) return 0;
  if (timer.status === "paused") return timer.remainingMsWhenPaused ?? 0;

  return Math.max(0, now - started);
}

/** What the wall should show right now. */
export function timerPhase(timer: HubTimer, now: number): TimerPhase {
  if (timer.status === "complete") return "complete";

  if (timer.status === "overtime") {
    const left = overtimeRemainingMs(timer, now);
    return left !== null && left <= 0 ? "overtime_expired" : "overtime";
  }

  if (timer.status === "running") {
    const left = remainingMs(timer, now);
    /* An untimed round (`left === null`) never leaves "running". */
    if (left === null || left > 0) return "running";

    /*
     * Regulation is over. A timed procedure rolls STRAIGHT into extra
     * time — the founder, judging real rounds: "it forces me to go back
     * to the event screen to start the 5 min timer again. That's
     * redundant. Immediately start the 5 min overtime timer." Derived,
     * not written, exactly like TIME IN ROUND always was: the wall
     * flips at the instant regulation ends whether or not any phone is
     * awake, and the extra-time clock is arithmetic on the same start
     * stamp. Turn-counted procedures still read TIME IN ROUND, because
     * for them there is no clock to start.
     */
    const cap = impliedOvertimeMs(timer);
    if (cap === null) return "time_called";

    const end = regulationEndAt(timer);
    const up = end === null ? 0 : now - end;
    return up >= cap ? "overtime_expired" : "overtime";
  }

  return timer.status;
}

/** Whether the overtime overlay belongs on this panel. */
export function showsOvertimeRules(timer: HubTimer, now: number): boolean {
  /* Opt-in per timer. Without beginner mode the wall's answer to time
     is the clock itself — same size, counting up, glowing red. */
  if (!timer.beginnerMode) return false;
  if (timer.rulesDismissed) return false;

  const phase = timerPhase(timer, now);
  return (
    phase === "time_called" || phase === "overtime" || phase === "overtime_expired"
  );
}

/**
 * The urgency band, from regulation time left.
 *
 * Bands rather than a continuous ramp: a shop reads a state, not a
 * gradient, and "under five minutes" is a thing people say out loud.
 */
export function urgency(timer: HubTimer, now: number): Urgency {
  if (timerPhase(timer, now) !== "running") return "none";

  const left = remainingMs(timer, now);
  if (left === null) return "none";

  if (left < MINUTE_MS) return "one";
  if (left < 5 * MINUTE_MS) return "five";
  if (left < 10 * MINUTE_MS) return "ten";
  return "none";
}

/**
 * A clock, as it is read aloud.
 *
 * Minutes and seconds under an hour, hours above it — a 60-minute top
 * cut should say 60:00 rather than 1:00:00, so the hour only appears
 * once it genuinely has to.
 */
export function formatClock(ms: number | null): string {
  if (ms === null) return "--:--";

  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const pad = (value: number) => String(value).padStart(2, "0");

  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(Math.floor(total / 60))}:${pad(seconds)}`;
}

/** The same clock as words, for a screen reader. */
export function speakClock(ms: number | null): string {
  if (ms === null) return "untimed";

  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  const parts: string[] = [];
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  if (seconds > 0 || minutes === 0) {
    parts.push(`${seconds} ${seconds === 1 ? "second" : "seconds"}`);
  }

  return `${parts.join(" ")} remaining`;
}

/* -------------------------------------------------------------------- */
/* Transitions                                                          */
/*                                                                      */
/* Each returns the patch to write, or null for "that would not change  */
/* anything" — which is how a second control tab, a double tap, or a    */
/* retried request stops being a second start.                          */
/* -------------------------------------------------------------------- */

/**
 * Starts, or resumes.
 *
 * Resuming shifts `started_at` forward by however long the pause lasted
 * rather than storing an elapsed total, so a running timer has exactly
 * one formula everywhere and a paused one carries its own answer.
 */
export function start(timer: HubTimer, now: number): TimerPatch | null {
  if (timer.status === "running") return null;
  if (timer.status === "complete") return null;

  if (timer.status === "paused") {
    const left = timer.durationSeconds === null ? null : remainingMs(timer, now);
    const full = timer.durationSeconds === null ? null : timer.durationSeconds * 1000;

    return {
      status: "running",
      startedAt: new Date(
        full === null
          ? /* Untimed: the stored value is elapsed, so wind the start back
               by it and the count-up carries on where it stopped. */
            now - (timer.remainingMsWhenPaused ?? 0)
          : now - (full - (left ?? full)),
      ).toISOString(),
      pausedAt: null,
      remainingMsWhenPaused: null,
    };
  }

  return {
    status: "running",
    startedAt: new Date(now).toISOString(),
    pausedAt: null,
    remainingMsWhenPaused: null,
  };
}

export function pause(timer: HubTimer, now: number): TimerPatch | null {
  /* Keyed off the PHASE: a row still saying "running" whose regulation
     has ended is showing extra time or TIME on the wall, and pausing it
     would store zero and quietly restart overtime on resume. Publishers
     do not pause extra time, and neither does this. */
  if (timerPhase(timer, now) !== "running") return null;

  return {
    status: "paused",
    pausedAt: new Date(now).toISOString(),
    /* Untimed rounds store elapsed here instead. One column, because the
       thing being preserved is the same thing: where the clock was. */
    remainingMsWhenPaused:
      timer.durationSeconds === null
        ? (elapsedMs(timer, now) ?? 0)
        : (remainingMs(timer, now) ?? 0),
  };
}

export function reset(timer: HubTimer): TimerPatch | null {
  if (timer.status === "ready" && timer.overtimeStartedAt === null) return null;

  return {
    status: "ready",
    startedAt: null,
    pausedAt: null,
    remainingMsWhenPaused: null,
    overtimeStartedAt: null,
    overtimeDurationSeconds: null,
    overtimeTurn: 0,
    rulesDismissed: false,
  };
}

/**
 * Adds or removes time, wherever the timer happens to be.
 *
 * A judge granting a minute for a slow play call does it mid-round, and
 * staff correcting a fat-fingered preset does it before the round
 * starts, so this has to work in every state rather than only the
 * convenient one.
 */
export function adjust(
  timer: HubTimer,
  deltaMs: number,
  now: number,
): TimerPatch | null {
  if (timer.status === "complete") return null;

  if (timer.status === "overtime") {
    /* A turn-counted overtime has no clock to lengthen. */
    if (timer.overtimeDurationSeconds === null) return null;

    const started = stamp(timer.overtimeStartedAt) ?? now;
    const left = overtimeRemainingMs(timer, now) ?? 0;
    /* Never below zero: taking a minute off ten seconds should land on
       zero rather than on a negative clock that counts back up. */
    const shift = Math.max(deltaMs, -left);

    return { overtimeStartedAt: new Date(started + shift).toISOString() };
  }

  if (timer.durationSeconds === null) return null;

  if (timer.status === "ready") {
    const next = Math.max(0, timer.durationSeconds * 1000 + deltaMs);
    return { durationSeconds: Math.round(next / 1000) };
  }

  if (timer.status === "paused") {
    const left = remainingMs(timer, now) ?? 0;
    return { remainingMsWhenPaused: Math.max(0, left + deltaMs) };
  }

  if (timer.status === "running" || timer.status === "time_called") {
    const started = stamp(timer.startedAt) ?? now;
    const left = remainingMs(timer, now) ?? 0;
    const shift = Math.max(deltaMs, -left);

    return {
      /* Adding time to a round that already hit zero puts it back on the
         clock, which is what "give them one more minute" means. */
      status: left + shift > 0 ? "running" : timer.status,
      startedAt: new Date(started + shift).toISOString(),
    };
  }

  return null;
}

/** Calls time by hand, before the clock gets there. */
export function callTime(timer: HubTimer, now: number = Date.now()): TimerPatch | null {
  /* By phase, so a round already showing derived extra time cannot be
     yanked back to TIME IN ROUND by a stale control tab. */
  const phase = timerPhase(timer, now);
  if (phase === "time_called" || phase === "overtime") return null;
  if (phase === "overtime_expired" || phase === "complete") return null;

  return { status: "time_called", rulesDismissed: false };
}

/**
 * Starts the overtime clock.
 *
 * Refuses when overtime is already running, which is the guard that
 * matters: two staff phones on the same display, both tapping START
 * OVERTIME, must not restart a five-minute clock that has two minutes
 * left on it.
 */
export function startOvertime(
  timer: HubTimer,
  now: number,
  seconds: number | null,
): TimerPatch | null {
  if (timer.status === "overtime" || timer.status === "complete") return null;

  /* And by phase: regulation rolling straight into DERIVED extra time
     leaves the row saying "running", and a tap on a stale START
     OVERTIME button must not restart a clock that is two minutes in. */
  const phase = timerPhase(timer, now);
  if (phase === "overtime" || phase === "overtime_expired") return null;

  return {
    status: "overtime",
    overtimeStartedAt: new Date(now).toISOString(),
    overtimeDurationSeconds: seconds,
    overtimeTurn: 0,
    rulesDismissed: false,
  };
}

/**
 * Moves the turn tracker on by hand.
 *
 * By hand on purpose. A turn is not a length of time, and a display that
 * advanced "Turn 2 of 3" on a timer would be telling a room something
 * untrue about their own game.
 */
export function advanceTurn(
  timer: HubTimer,
  additionalTurns: number,
  by = 1,
  now: number = Date.now(),
): TimerPatch | null {
  if (additionalTurns <= 0) return null;

  /*
   * Keyed off the PHASE, not the stored status, and that distinction is a
   * bug this had.
   *
   * Regulation reaching zero is derived — the wall says TIME IN ROUND
   * without anybody writing a row, which is the whole point. But the row
   * still says "running" until staff confirm it, and this guard was
   * reading the row. So the turn buttons were dead in exactly the moment
   * they first appear: the rules card is on the wall, staff tap Next
   * turn, and nothing happens.
   */
  const phase = timerPhase(timer, now);
  if (phase !== "overtime" && phase !== "overtime_expired" && phase !== "time_called") {
    return null;
  }

  const next = Math.min(Math.max(0, timer.overtimeTurn + by), additionalTurns);
  if (next === timer.overtimeTurn) return null;

  return { overtimeTurn: next };
}

export function setRulesDismissed(
  timer: HubTimer,
  dismissed: boolean,
): TimerPatch | null {
  if (timer.rulesDismissed === dismissed) return null;
  return { rulesDismissed: dismissed };
}

/** Turns the procedure card at time on or off for this tournament. */
export function setBeginnerMode(
  timer: HubTimer,
  beginnerMode: boolean,
): TimerPatch | null {
  if (timer.beginnerMode === beginnerMode) return null;
  /* Turning it on un-dismisses too: "show the rules" pressed once
     should not need a second press to undo an old dismissal. */
  return beginnerMode ? { beginnerMode, rulesDismissed: false } : { beginnerMode };
}

export function complete(timer: HubTimer): TimerPatch | null {
  if (timer.status === "complete") return null;
  return { status: "complete", rulesDismissed: true };
}
