import { regulationEndAt, timerPhase, type HubTimer, type TimerPatch } from "./timer";

/**
 * Auto Mode: the intermission between rounds, as arithmetic.
 *
 * The founder's pitch this has to make credible: "Start your tournament
 * and let FlareCast run the room." When regulation hits zero on an
 * Auto Mode tournament, a between-rounds countdown begins — time enough
 * for the organizer to enter results and post pairings in Bandai TCG+ or
 * whatever they already use — and when it reaches zero the next round
 * starts itself: round incremented, regulation reloaded, every screen
 * back to normal.
 *
 * Nothing here is a stored countdown. The deadline is when time hit,
 * plus the configured window, plus whatever the organizer added — the
 * same instants-not-countdowns design as the timer itself, which is what
 * makes a refresh, a second phone, and a TV with a wrong clock all
 * already solved. The ONLY writes are decisions: hold, resume, +2 min,
 * and the round start itself (guarded server-side so two devices cannot
 * both fire it).
 *
 * Free of server imports on purpose: the controller runs these same
 * functions for its optimistic taps, and the tests walk them directly.
 */

/** The recommended default. The founder wants real-store data on this. */
export const DEFAULT_INTERMISSION_SECONDS = 180;

/** The offered lengths, in minutes. Anything else is "custom". */
export const INTERMISSION_MINUTE_CHOICES = [2, 3, 5] as const;

/** What one press of +2 MIN adds. */
export const EXTEND_MS = 2 * 60_000;

/**
 * How stale a missed deadline may be before auto-start refuses.
 *
 * If nothing polled for this long past the target — the shop's wifi
 * died, the TV was off — starting a round into an empty room helps
 * nobody. The countdown becomes "waiting for organizer" instead, and a
 * person decides.
 */
export const STALE_START_MS = 10 * 60_000;

/** How long TIME IN ROUND owns the screen before the slides begin. */
export const TAKEOVER_MS = 8_000;

/**
 * Fired close to schedule, the round starts ON schedule.
 *
 * The poll that materialises the start runs every few seconds, so the
 * write lands a beat after the deadline. Backdating `started_at` to the
 * deadline keeps the clock honest — 34:58 on the wall because the round
 * began at zero, not when the TV noticed. Beyond this window the write
 * is genuinely late, and pretending otherwise would short the round.
 */
const START_GRACE_MS = 15_000;

export type IntermissionState =
  /** Counting down to the next round. The normal case. */
  | "counting"
  /** The organizer pressed HOLD. Frozen until they act. */
  | "held"
  /** Zero, but the previous round is explicitly still in overtime. */
  | "blocked"
  /** Zero, and waiting for a person: auto-start off, or the deadline
      went stale while nothing was watching. */
  | "waiting"
  /** Zero and safe. The server starts the round on the next read. */
  | "due";

export interface Intermission {
  state: IntermissionState;
  /** The round the countdown is heading toward. */
  nextRound: number;
  /** When time hit — the instant the intermission began. */
  anchor: number;
  /** When the next round is scheduled to start, epoch ms. */
  deadline: number;
  /** What the countdown reads. Frozen at the held instant while held. */
  remainingMs: number;
}

function stamp(iso: string | null): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

/**
 * The intermission this timer is in, or null.
 *
 * Null is the answer for every timer with Auto Mode off, which is the
 * guarantee the whole feature rests on: OFF means FlareCast behaves
 * exactly as it does today.
 */
export function intermissionFor(timer: HubTimer, now: number): Intermission | null {
  if (!timer.autoMode) return null;

  /* A round that never ran has no ending to count down from — a
     mistaken Call time on a READY timer must not schedule anything. */
  if (timer.startedAt === null) return null;

  /* And past the round cap there is no next round to head toward, so
     there is no intermission: 99 ends when a person ends it. */
  if ((timer.round ?? 1) >= 99) return null;

  const phase = timerPhase(timer, now);
  if (phase !== "time_called" && phase !== "overtime" && phase !== "overtime_expired") {
    return null;
  }

  /* Anchored on the hand-call when there was one — time called at 28:00
     starts the window at 28:00 — and on regulation's own end otherwise.
     A row with neither cannot say when time hit, so it has no window. */
  const anchor = stamp(timer.timeCalledAt) ?? regulationEndAt(timer);
  if (anchor === null) return null;

  const deadline =
    anchor + timer.intermissionSeconds * 1000 + timer.intermissionExtendedMs;
  const nextRound = (timer.round ?? 1) + 1;

  const heldAt = stamp(timer.autoHeldAt);
  if (heldAt !== null) {
    return {
      state: "held",
      nextRound,
      anchor,
      deadline,
      remainingMs: Math.max(0, deadline - heldAt),
    };
  }

  const remainingMs = Math.max(0, deadline - now);
  if (remainingMs > 0) {
    return { state: "counting", nextRound, anchor, deadline, remainingMs };
  }

  /*
   * Zero. Whether the round may start is the careful part.
   *
   * An EXPLICIT overtime — staff pressed START OVERTIME, the row says
   * so — is an unresolved round, and Auto Mode must never start the
   * next one over it. The DERIVED extra time every timed game rolls
   * into at zero deliberately does not block: it is the normal shape of
   * every round's ending, and a countdown that always refused would be
   * a feature that never fires. A table genuinely still playing is what
   * HOLD and +2 MIN are for.
   */
  if (timer.status === "overtime") {
    return { state: "blocked", nextRound, anchor, deadline, remainingMs: 0 };
  }

  if (!timer.autoStart || now - deadline > STALE_START_MS) {
    return { state: "waiting", nextRound, anchor, deadline, remainingMs: 0 };
  }

  return { state: "due", nextRound, anchor, deadline, remainingMs: 0 };
}

/* -------------------------------------------------------------------- */
/* Transitions. Same contract as timer.ts: the patch to write, or null  */
/* for "that would change nothing" — the shape that makes double taps,  */
/* second phones and stale tabs harmless.                               */
/* -------------------------------------------------------------------- */

/** HOLD NEXT ROUND. The countdown freezes where it is. */
export function holdAuto(timer: HubTimer, now: number): TimerPatch | null {
  const intermission = intermissionFor(timer, now);
  if (!intermission || intermission.state === "held") return null;

  return { autoHeldAt: new Date(now).toISOString() };
}

/**
 * RESUME. The held span folds into the extension, so the countdown
 * carries on from exactly the number it froze at.
 */
export function resumeAuto(timer: HubTimer, now: number): TimerPatch | null {
  const intermission = intermissionFor(timer, now);
  if (!intermission || intermission.state !== "held") return null;

  const heldAt = stamp(timer.autoHeldAt) ?? now;
  return {
    intermissionExtendedMs: timer.intermissionExtendedMs + Math.max(0, now - heldAt),
    autoHeldAt: null,
  };
}

/**
 * +2 MIN. Repeatable on purpose — a judge call is however long it is.
 *
 * From a countdown that already lapsed (waiting, blocked), the two
 * minutes are measured from NOW, so the button always yields a
 * countdown that reads about 2:00 rather than one still in the past.
 */
export function extendAuto(timer: HubTimer, now: number): TimerPatch | null {
  const intermission = intermissionFor(timer, now);
  if (!intermission) return null;

  /*
   * The reference the two minutes are added to. While HELD the countdown
   * is frozen and the wall clock is irrelevant — the reference is
   * wherever the frozen clock stands, or a ten-minute judge call would
   * turn +2 MIN into +12. Otherwise a lapsed target measures from now,
   * so the button always yields a countdown reading about 2:00.
   */
  const heldAt = stamp(timer.autoHeldAt);
  const base =
    heldAt !== null
      ? Math.max(intermission.deadline, heldAt)
      : Math.max(intermission.deadline, now);

  const target = base + EXTEND_MS;
  return {
    intermissionExtendedMs:
      timer.intermissionExtendedMs + (target - intermission.deadline),
  };
}

/**
 * The round start itself — automatic at zero, or START NOW by hand.
 *
 * One patch for both, because they are the same transition: increment
 * the round, reload regulation, clear every between-rounds remnant, and
 * run. The write goes through the guarded path in the repository, so of
 * two devices computing this at once exactly one lands.
 */
export function startNextRound(timer: HubTimer, now: number): TimerPatch | null {
  const intermission = intermissionFor(timer, now);
  if (!intermission) return null;

  const startedAt =
    intermission.state === "due" && now - intermission.deadline <= START_GRACE_MS
      ? intermission.deadline
      : now;

  return {
    status: "running",
    round: intermission.nextRound,
    startedAt: new Date(startedAt).toISOString(),
    pausedAt: null,
    remainingMsWhenPaused: null,
    overtimeStartedAt: null,
    overtimeDurationSeconds: null,
    overtimeTurn: 0,
    rulesDismissed: false,
    timeCalledAt: null,
    autoHeldAt: null,
    intermissionExtendedMs: 0,
  };
}

/** The per-tournament switch. Turning it off tidies the remnants too. */
export function setAutoMode(timer: HubTimer, on: boolean): TimerPatch | null {
  if (timer.autoMode === on) return null;
  return on
    ? { autoMode: true }
    : { autoMode: false, autoHeldAt: null, intermissionExtendedMs: 0 };
}

/** Whether zero starts the round, or waits for a person. */
export function setAutoStart(timer: HubTimer, on: boolean): TimerPatch | null {
  if (timer.autoStart === on) return null;
  return { autoStart: on };
}

/** The configured window. Validated by the caller; clamped here anyway. */
export function setIntermissionSeconds(
  timer: HubTimer,
  seconds: number,
): TimerPatch | null {
  const next = Math.min(3600, Math.max(30, Math.round(seconds)));
  if (timer.intermissionSeconds === next) return null;
  return { intermissionSeconds: next };
}
