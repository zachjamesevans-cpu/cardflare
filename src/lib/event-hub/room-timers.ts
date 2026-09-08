import { intermissionFor, type IntermissionState } from "./auto-mode";
import {
  GAME_PROFILES,
  nameRepeatsGame,
  procedureFor,
  type Bracket,
} from "./game-profiles";
import { listDisplays, listTimers } from "./repository";
import {
  elapsedMs,
  impliedOvertimeMs,
  isStaleTimer,
  overtimeCapMs,
  remainingMs,
  timerPhase,
  type HubTimer,
  type TimerStatus,
} from "./timer";
import type { RoomTimerWire } from "./room-timer-wire";

/**
 * The store's live tournament clocks, shaped for a room payload.
 *
 * Ready and finished timers are left out: a phone glancing at the room
 * wants "how long is left", and a timer nobody has started answers a
 * question nobody asked. What remains is the same arithmetic the wall
 * runs, folded into instants the client can tick on its own — see
 * `room-timer-wire.ts` for the reader's half.
 */
export async function roomTimersForStore(
  storeId: string,
  now: number = Date.now(),
): Promise<RoomTimerWire[]> {
  const displays = await listDisplays(storeId);
  if (displays.length === 0) return [];

  const timers = (
    await Promise.all(displays.map((display) => listTimers(display.id)))
  ).flat();

  return timers
    .map((timer) => timerWire(timer, now))
    .filter((wire): wire is RoomTimerWire => wire !== null);
}

/**
 * One tournament as the screens overview shows it: what it is, the
 * colour the wall gives it, where it stands, and a wire for its clock
 * (null until somebody starts it).
 *
 * The founder, running several tournaments across several screens:
 * the overview "should have the color code of whichever tournament is
 * on that screen too... just more helpful info on that screen". So a
 * row carries enough to read the night at a glance and to press the
 * next thing without opening the manage page.
 */
export interface ScreenCardRow {
  id: string;
  gameName: string;
  /**
   * What staff called it, or null when that only repeats the game: the
   * same rule the wall follows, so "Lorcana" under LORCANA is not
   * printed twice.
   */
  eventName: string | null;
  /** The game's accent token, e.g. `--color-game-one-piece`. */
  accentToken: string;
  round: number | null;
  bracket: Bracket;
  format: string | null;
  status: TimerStatus;
  /** The tournament runs its own between-rounds countdown. */
  autoMode: boolean;
  /**
   * Where Auto Mode's intermission stood when the page was built.
   * `counting` carries on ticking through the wire's `nextRoundAt`;
   * the rest are the organizer's business and do not change on their
   * own.
   */
  intermission: IntermissionState | null;
  wire: RoomTimerWire | null;
}

/** Everything on one screen, shaped for its overview card. */
export async function screenRows(
  displayId: string,
  now: number = Date.now(),
): Promise<ScreenCardRow[]> {
  const timers = await listTimers(displayId);
  return timers.map((timer) => {
    const profile = GAME_PROFILES[timer.game];
    return {
      id: timer.id,
      gameName: profile.shortName,
      eventName: nameRepeatsGame(profile, timer.eventName) ? null : timer.eventName,
      accentToken: profile.accentToken,
      round: timer.round,
      bracket: timer.bracket,
      format: timer.format,
      status: timer.status,
      autoMode: timer.autoMode,
      intermission: intermissionFor(timer, now)?.state ?? null,
      wire: timerWire(timer, now),
    };
  });
}

/**
 * One timer as a wire. Exported for the controller's screens overview,
 * which shows the same ticking clock on each screen card.
 */
export function timerWire(timer: HubTimer, now: number): RoomTimerWire | null {
  const phase = timerPhase(timer, now);
  if (phase === "ready" || phase === "complete") return null;

  /* The overnight failsafe: last night's never-closed timer must not
     greet tomorrow's first scan with "Extra time over". Derived, so the
     room is clean even before the console's lazy reset has run. */
  if (isStaleTimer(timer, now)) return null;

  const profile = GAME_PROFILES[timer.game];

  /* Auto Mode's countdown reaches the phones too, but only while it is
     actually counting: a hold or an overtime block is the organizer's
     business, and the phone falls back to the round's own state. */
  const intermission = intermissionFor(timer, now);
  const counting = intermission?.state === "counting";

  const base: RoomTimerWire = {
    id: timer.id,
    game: timer.game,
    gameName: profile.shortName,
    eventName: timer.eventName,
    round: timer.round,
    phase,
    headline: procedureFor(profile, timer.bracket).headline,
    endsAt: null,
    overtimeSinceAt: null,
    overtimeCapMs: null,
    untimedSinceAt: null,
    staticMs: null,
    nextRoundAt: counting ? new Date(intermission.deadline).toISOString() : null,
    nextRound: counting ? intermission.nextRound : null,
  };

  if (timer.status === "overtime") {
    return {
      ...base,
      overtimeSinceAt: timer.overtimeStartedAt,
      overtimeCapMs: overtimeCapMs(timer, now),
    };
  }

  if (timer.status === "running") {
    if (timer.durationSeconds === null) {
      return { ...base, untimedSinceAt: timer.startedAt };
    }

    const started = timer.startedAt ? Date.parse(timer.startedAt) : NaN;
    if (!Number.isFinite(started)) {
      return { ...base, staticMs: timer.durationSeconds * 1000 };
    }

    return {
      ...base,
      /* One instant carries the whole story: countdown to here, then
         count UP from here toward the cap — the phone needs no second
         fetch to cross the boundary. */
      endsAt: new Date(started + timer.durationSeconds * 1000).toISOString(),
      overtimeCapMs: impliedOvertimeMs(timer),
    };
  }

  if (timer.status === "paused") {
    return {
      ...base,
      staticMs:
        timer.durationSeconds === null
          ? (elapsedMs(timer, now) ?? 0)
          : (remainingMs(timer, now) ?? 0),
    };
  }

  /* time_called by hand: a stopped clock at zero, until staff start the
     extra-time countdown (which lands in the overtime branch above). */
  return { ...base, staticMs: 0 };
}
