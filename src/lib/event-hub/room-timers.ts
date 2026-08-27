import { GAME_PROFILES, procedureFor } from "./game-profiles";
import { listDisplays, listTimers } from "./repository";
import {
  elapsedMs,
  impliedOvertimeMs,
  overtimeCapMs,
  remainingMs,
  timerPhase,
  type HubTimer,
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
    .map((timer) => wireFor(timer, now))
    .filter((wire): wire is RoomTimerWire => wire !== null);
}

function wireFor(timer: HubTimer, now: number): RoomTimerWire | null {
  const phase = timerPhase(timer, now);
  if (phase === "ready" || phase === "complete") return null;

  const profile = GAME_PROFILES[timer.game];
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
