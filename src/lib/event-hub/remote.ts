import "server-only";

import { intermissionFor } from "./auto-mode";
import { GAME_PROFILES } from "./game-profiles";
import { listDisplays, listTimers, type HubDisplay } from "./repository";
import { timerWire } from "./room-timers";
import { impliedOvertimeMs, type HubTimer } from "./timer";
import type { RemoteDisplay, RemoteTimer } from "./remote-wire";

/**
 * The store's screens, shaped for the phone's remote.
 *
 * Built from the same rows and the same arithmetic the television
 * reads, so the phone and the wall can never disagree: `wire` is the
 * room's own clock wire, and the auto block is `intermissionFor` read
 * once at `now`. The phone ticks from there on its own clock and asks
 * again on a poll; it never holds the countdown.
 */

/** One timer as the remote sees it. Shared by the list and the reply to a press. */
export function remoteTimer(
  timer: HubTimer,
  display: HubDisplay,
  now: number = Date.now(),
): RemoteTimer {
  const profile = GAME_PROFILES[timer.game];
  const intermission = intermissionFor(timer, now);

  return {
    id: timer.id,
    displayId: display.id,
    displayName: display.name,
    game: timer.game,
    gameName: profile.shortName,
    eventName: timer.eventName,
    /* The same default the intermission counts from: an unnumbered
       round is the first one. */
    round: timer.round ?? 1,
    status: timer.status,
    wire: timerWire(timer, now),
    /* The round length, as chosen at creation from the preset or the
       custom minutes. Zero for a deliberately untimed round. */
    regulationMs: (timer.durationSeconds ?? 0) * 1000,
    /* Null means the procedure counts turns rather than minutes. */
    turnCounted: impliedOvertimeMs(timer) === null,
    auto: {
      enabled: timer.autoMode,
      autoStart: timer.autoStart,
      counting: intermission?.state === "counting",
      held: intermission?.state === "held",
      nextRoundAt: intermission ? new Date(intermission.deadline).toISOString() : null,
      nextRound: intermission?.nextRound ?? null,
      intermissionSeconds: timer.intermissionSeconds,
    },
    controlledBy: timer.controlledBy,
    controlledAt: timer.controlledAt,
    updatedAt: timer.updatedAt,
  };
}

/** Every display the store owns, each with its timers, oldest first. */
export async function remoteDisplaysFor(
  storeId: string,
  now: number = Date.now(),
): Promise<RemoteDisplay[]> {
  const displays = await listDisplays(storeId);

  return Promise.all(
    displays.map(async (display) => ({
      id: display.id,
      name: display.name,
      timers: (await listTimers(display.id)).map((timer) =>
        remoteTimer(timer, display, now),
      ),
    })),
  );
}
