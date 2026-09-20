import "server-only";

import { checkIntermissionSeconds } from "./schema";
import { GAME_PROFILES, procedureFor, type GameId } from "./game-profiles";
import {
  logTimerEvent,
  patchTimer,
  patchTimerIfUnchanged,
  type HubDisplay,
} from "./repository";
import {
  extendAuto,
  holdAuto,
  resumeAuto,
  setAutoMode,
  setAutoStart,
  setIntermissionSeconds,
  startNextRound,
} from "./auto-mode";
import {
  advanceRound,
  advanceTurn,
  adjust,
  callTime,
  complete,
  impliedOvertimeMs,
  pause,
  reset,
  setBeginnerMode,
  setRulesDismissed,
  start,
  startOvertime,
  type HubTimer,
  type TimerPatch,
} from "./timer";

/**
 * One press on a timer, from wherever it came.
 *
 * The console's buttons and the phone's remote send the same words,
 * and this is the one place those words become writes: establish the
 * patch from the row AS IT IS NOW, write it (guarded where the press
 * races the automatic round start), and stamp who pressed it. The
 * caller has already decided the presser may touch this timer; nothing
 * here asks again, which is why this module takes an already-found
 * timer rather than an id.
 *
 * A transition returning null writes nothing. That is what makes a
 * double tap, a second staff phone, and a retried request all harmless:
 * starting a running timer is not an error, it is a no-op.
 *
 * Returns whether a write landed, so the remote can say "done" or "the
 * wall had already moved on" rather than guessing.
 */

export interface ControlInput {
  /** For the "auto-intermission" op: the picker's choice and its custom minutes. */
  intermissionChoice?: string | null;
  intermissionCustom?: string | null;
}

/** The stamp every successful write carries. */
function pressedBy(
  by: string | null,
  now: number,
): Pick<TimerPatch, "controlledBy" | "controlledAt"> {
  return { controlledBy: by, controlledAt: new Date(now).toISOString() };
}

export async function controlTimer(
  found: { timer: HubTimer; display: HubDisplay },
  op: string,
  input: ControlInput,
  /** The presser's name, for the other organizer's screen. Null for unknown. */
  by: string | null,
): Promise<boolean> {
  const { timer } = found;
  const now = Date.now();
  const stamp = pressedBy(by, now);

  const procedure = procedureFor(GAME_PROFILES[timer.game as GameId], timer.bracket);

  let patch: TimerPatch | null = null;

  /*
   * The between-rounds ops race the automatic round start on every
   * polling television, so their writes are GUARDED like the start
   * itself: computed against the row as read, refused if anything
   * landed in between. Without this, a HOLD pressed at 0:01 could lose
   * the race and stamp its hold onto the freshly started next round —
   * invisible until that round's own intermission is born frozen.
   */
  let guarded = false;

  switch (op) {
    case "start":
      patch = start(timer, now);
      break;
    case "pause":
      patch = pause(timer, now);
      break;
    case "reset":
      patch = reset(timer);
      break;
    case "add-minute":
      patch = adjust(timer, 60_000, now);
      break;
    case "subtract-minute":
      patch = adjust(timer, -60_000, now);
      break;
    case "call-time":
      patch = callTime(timer, now);
      break;
    case "start-overtime": {
      /* The procedure decides the length, not the form — preset-aware,
         so Top Cut gets its 10:00. A turn-counted procedure gets null,
         and the display shows turns instead of a countdown it was never
         supposed to have. */
      const impliedMs = impliedOvertimeMs(timer);
      patch = startOvertime(timer, now, impliedMs === null ? null : impliedMs / 1000);
      break;
    }
    case "next-turn":
      patch = advanceTurn(timer, procedure.additionalTurns, 1, now);
      break;
    case "previous-turn":
      patch = advanceTurn(timer, procedure.additionalTurns, -1, now);
      break;
    case "dismiss-rules":
      patch = setRulesDismissed(timer, true);
      break;
    case "reopen-rules":
      patch = setRulesDismissed(timer, false);
      break;
    case "beginner-on":
      patch = setBeginnerMode(timer, true);
      break;
    case "beginner-off":
      patch = setBeginnerMode(timer, false);
      break;
    case "complete":
      patch = complete(timer);
      break;

    /*
     * Auto Mode. Every op is computed from the row as it is NOW — a
     * stale tab sends only an intention, and an intention that no
     * longer applies (hold a round that already started, resume a
     * countdown nobody held) computes to null and writes nothing.
     */
    case "auto-on":
      patch = setAutoMode(timer, true);
      if (patch) void logTimerEvent(timer.id, "auto-on");
      break;
    case "auto-off":
      patch = setAutoMode(timer, false);
      if (patch) void logTimerEvent(timer.id, "auto-off");
      break;
    case "auto-start-on":
      patch = setAutoStart(timer, true);
      break;
    case "auto-start-off":
      patch = setAutoStart(timer, false);
      break;
    case "auto-intermission":
      patch = setIntermissionSeconds(
        timer,
        checkIntermissionSeconds(
          input.intermissionChoice ?? "",
          input.intermissionCustom ?? "",
        ),
      );
      break;
    case "auto-hold":
      patch = holdAuto(timer, now);
      guarded = true;
      break;
    case "auto-resume":
      patch = resumeAuto(timer, now);
      guarded = true;
      break;
    case "auto-extend":
      patch = extendAuto(timer, now);
      guarded = true;
      break;

    /*
     * The manual next round, from the screens overview, a panel or the
     * remote. The same guarded write as the automatic start, because it
     * races it: a TO pressing "Next round" at the exact instant a
     * television's poll starts it must yield ONE round four, not two.
     */
    case "next-round": {
      const roundPatch = advanceRound(timer, now);
      if (!roundPatch) return false;

      const advanced = await patchTimerIfUnchanged(timer.id, timer.updatedAt, {
        ...roundPatch,
        ...stamp,
      });
      if (advanced) {
        void logTimerEvent(
          timer.id,
          "round-started",
          `manual · round ${advanced.round}`,
        );
      }

      return advanced !== null;
    }

    /*
     * START NOW is the one op that goes through the GUARDED write: it
     * races the automatic start on every polling television, and of the
     * two computed transitions exactly one may land. The loser's guard
     * fails on `updated_at` and the round is simply already running.
     */
    case "auto-start-now": {
      const startPatch = startNextRound(timer, now);
      if (!startPatch) return false;

      const advanced = await patchTimerIfUnchanged(timer.id, timer.updatedAt, {
        ...startPatch,
        ...stamp,
      });
      if (advanced) {
        void logTimerEvent(
          timer.id,
          "round-started",
          `manual · round ${advanced.round}`,
        );
      }

      return advanced !== null;
    }

    default:
      return false;
  }

  if (!patch) return false;

  if (guarded) {
    /* Refused-on-conflict is the right outcome: whatever landed first
       is fresher than this intention, and the next poll shows it. The
       log line only exists when the write actually did. */
    const landed = await patchTimerIfUnchanged(timer.id, timer.updatedAt, {
      ...patch,
      ...stamp,
    });
    if (landed) {
      void logTimerEvent(
        timer.id,
        op === "auto-hold"
          ? "auto-held"
          : op === "auto-resume"
            ? "auto-resumed"
            : "auto-extended",
        op === "auto-hold"
          ? "by organizer"
          : op === "auto-extend"
            ? "+2 min"
            : undefined,
      );
    }
    return landed !== null;
  }

  return patchTimer(timer.id, { ...patch, ...stamp });
}
