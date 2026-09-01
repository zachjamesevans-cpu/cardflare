import { describe, expect, it } from "vitest";

import {
  EXTEND_MS,
  extendAuto,
  holdAuto,
  intermissionFor,
  resumeAuto,
  setAutoMode,
  setIntermissionSeconds,
  STALE_START_MS,
  startNextRound,
} from "@/lib/event-hub/auto-mode";
import {
  adjust,
  advanceRound,
  callTime,
  start,
  reset,
  type HubTimer,
} from "@/lib/event-hub/timer";

/**
 * Auto Mode, which is a promise: "start the tournament and let
 * FlareCast run the room." The failures rehearsed here are the ones a
 * real store night produces — a refresh mid-intermission, two devices
 * both deciding to start round four, a HOLD from a stale tab, a table
 * still in overtime at zero — and every one of them is arithmetic on a
 * row, so every one of them is testable without a browser or a clock.
 */

const T0 = Date.parse("2026-08-27T19:00:00.000Z");
const MIN = 60_000;

/** A 35-minute One Piece round, started at T0, with Auto Mode ON. */
function autoTimer(overrides: Partial<HubTimer> = {}): HubTimer {
  return {
    id: "timer-1",
    displayId: "display-1",
    position: 0,
    game: "one-piece",
    eventName: "Store Tournament",
    round: 3,
    format: null,
    bracket: "swiss",
    presetId: "store-tournament",
    durationSeconds: 35 * 60,
    status: "running",
    startedAt: new Date(T0).toISOString(),
    pausedAt: null,
    remainingMsWhenPaused: null,
    overtimeStartedAt: null,
    overtimeDurationSeconds: null,
    overtimeTurn: 0,
    rulesDismissed: false,
    beginnerMode: false,
    autoMode: true,
    autoStart: true,
    intermissionSeconds: 180,
    intermissionExtendedMs: 0,
    autoHeldAt: null,
    timeCalledAt: null,
    updatedAt: new Date(T0).toISOString(),
    ...overrides,
  };
}

/** Regulation's end for the fixture above. */
const TIME_AT = T0 + 35 * MIN;

function apply(current: HubTimer, patch: ReturnType<typeof holdAuto>): HubTimer {
  return patch ? { ...current, ...patch } : current;
}

describe("Auto Mode off preserves current behaviour", () => {
  it("derives no intermission in any phase", () => {
    const off = autoTimer({ autoMode: false });

    expect(intermissionFor(off, T0 + 10 * MIN)).toBeNull();
    expect(intermissionFor(off, TIME_AT + MIN)).toBeNull();
    expect(intermissionFor(off, TIME_AT + 30 * MIN)).toBeNull();
  });

  it("refuses every transition", () => {
    const off = autoTimer({ autoMode: false });

    expect(holdAuto(off, TIME_AT + MIN)).toBeNull();
    expect(extendAuto(off, TIME_AT + MIN)).toBeNull();
    expect(startNextRound(off, TIME_AT + 4 * MIN)).toBeNull();
  });
});

describe("the intermission begins at time, on its own", () => {
  it("is absent while regulation runs", () => {
    expect(intermissionFor(autoTimer(), TIME_AT - 1000)).toBeNull();
  });

  it("counts down from the instant regulation ends", () => {
    const between = intermissionFor(autoTimer(), TIME_AT + MIN);

    expect(between).not.toBeNull();
    expect(between!.state).toBe("counting");
    expect(between!.nextRound).toBe(4);
    expect(between!.anchor).toBe(TIME_AT);
    expect(between!.remainingMs).toBe(2 * MIN);
  });

  it("survives a refresh, because it is derived", () => {
    /* Two devices, or one device twice: the same row reads the same. */
    const first = intermissionFor(autoTimer(), TIME_AT + 90_000);
    const second = intermissionFor(autoTimer(), TIME_AT + 90_000);

    expect(first).toEqual(second);
  });

  it("anchors on a hand call that beat the clock", () => {
    const early = apply(autoTimer(), callTime(autoTimer(), T0 + 28 * MIN));
    const between = intermissionFor(early, T0 + 29 * MIN);

    expect(between!.anchor).toBe(T0 + 28 * MIN);
    expect(between!.remainingMs).toBe(2 * MIN);
  });

  it("anchors an untimed round on its call", () => {
    const untimed = autoTimer({ durationSeconds: null });
    const called = apply(untimed, callTime(untimed, T0 + 50 * MIN));
    const between = intermissionFor(called, T0 + 51 * MIN);

    expect(between!.state).toBe("counting");
    expect(between!.remainingMs).toBe(2 * MIN);
  });

  it("treats a missing round number as round one ending", () => {
    const unnumbered = autoTimer({ round: null });
    expect(intermissionFor(unnumbered, TIME_AT + MIN)!.nextRound).toBe(2);
  });
});

describe("hold and resume", () => {
  it("freezes the countdown where it was", () => {
    const held = apply(autoTimer(), holdAuto(autoTimer(), TIME_AT + MIN));

    const at = intermissionFor(held, TIME_AT + MIN)!;
    const later = intermissionFor(held, TIME_AT + 30 * MIN)!;

    expect(at.state).toBe("held");
    expect(at.remainingMs).toBe(2 * MIN);
    /* Half an hour later the frozen number has not moved, and nothing
       has started. */
    expect(later.state).toBe("held");
    expect(later.remainingMs).toBe(2 * MIN);
  });

  it("resumes from exactly the frozen number", () => {
    let t = autoTimer();
    t = apply(t, holdAuto(t, TIME_AT + MIN));
    t = apply(t, resumeAuto(t, TIME_AT + 10 * MIN));

    const between = intermissionFor(t, TIME_AT + 10 * MIN)!;
    expect(between.state).toBe("counting");
    expect(between.remainingMs).toBe(2 * MIN);
  });

  it("refuses a second hold, and a resume with nothing held", () => {
    const held = apply(autoTimer(), holdAuto(autoTimer(), TIME_AT + MIN));

    expect(holdAuto(held, TIME_AT + 2 * MIN)).toBeNull();
    expect(resumeAuto(autoTimer(), TIME_AT + MIN)).toBeNull();
  });

  it("never starts a held round", () => {
    const held = apply(autoTimer(), holdAuto(autoTimer(), TIME_AT + MIN));
    expect(intermissionFor(held, TIME_AT + 30 * MIN)!.state).toBe("held");
  });
});

describe("+2 min", () => {
  it("adds two minutes to a running countdown", () => {
    const extended = apply(autoTimer(), extendAuto(autoTimer(), TIME_AT + MIN));

    expect(intermissionFor(extended, TIME_AT + MIN)!.remainingMs).toBe(4 * MIN);
  });

  it("stacks, because a judge call is however long it is", () => {
    let t = autoTimer();
    t = apply(t, extendAuto(t, TIME_AT + MIN));
    t = apply(t, extendAuto(t, TIME_AT + MIN));

    expect(intermissionFor(t, TIME_AT + MIN)!.remainingMs).toBe(6 * MIN);
  });

  it("measures from now when the target already lapsed", () => {
    /* Waiting at zero for five minutes, then +2 MIN: the countdown must
       read 2:00, not still be in the past. */
    const waiting = autoTimer({ autoStart: false });
    const at = TIME_AT + 8 * MIN;

    const revived = apply(waiting, extendAuto(waiting, at));
    expect(intermissionFor(revived, at)!.remainingMs).toBe(EXTEND_MS);
  });
});

describe("starting the next round", () => {
  it("is due at zero when everything is safe", () => {
    expect(intermissionFor(autoTimer(), TIME_AT + 3 * MIN)!.state).toBe("due");
  });

  it("increments the round once and reloads regulation", () => {
    const at = TIME_AT + 3 * MIN + 2000;
    const patch = startNextRound(autoTimer(), at)!;

    expect(patch.round).toBe(4);
    expect(patch.status).toBe("running");
    /* Fired two seconds after the target: the round starts ON the
       target, so the wall's clock is honest. */
    expect(patch.startedAt).toBe(new Date(TIME_AT + 3 * MIN).toISOString());
    /* And every between-rounds remnant clears with it. */
    expect(patch.timeCalledAt).toBeNull();
    expect(patch.autoHeldAt).toBeNull();
    expect(patch.intermissionExtendedMs).toBe(0);
    expect(patch.overtimeStartedAt).toBeNull();
    expect(patch.overtimeTurn).toBe(0);
  });

  it("starts from now when fired late by hand", () => {
    /* START NOW from a waiting state, minutes after the target. */
    const waiting = autoTimer({ autoStart: false });
    const at = TIME_AT + 9 * MIN;

    expect(startNextRound(waiting, at)!.startedAt).toBe(new Date(at).toISOString());
  });

  it("starts by hand from held, blocked and waiting alike", () => {
    const held = apply(autoTimer(), holdAuto(autoTimer(), TIME_AT + MIN));
    const blocked = autoTimer({
      status: "overtime",
      overtimeStartedAt: new Date(TIME_AT).toISOString(),
      overtimeDurationSeconds: 300,
    });

    expect(startNextRound(held, TIME_AT + 30 * MIN)!.round).toBe(4);
    expect(startNextRound(blocked, TIME_AT + 4 * MIN)!.round).toBe(4);
  });
});

describe("overtime safety", () => {
  it("auto-holds at zero while an explicit overtime is unresolved", () => {
    const overtime = autoTimer({
      status: "overtime",
      overtimeStartedAt: new Date(TIME_AT).toISOString(),
      overtimeDurationSeconds: 300,
    });

    expect(intermissionFor(overtime, TIME_AT + 3 * MIN)!.state).toBe("blocked");
    /* And an expired overtime clock is still an unresolved round. */
    expect(intermissionFor(overtime, TIME_AT + 6 * MIN)!.state).toBe("blocked");
  });

  it("does not block on the DERIVED extra time every round rolls into", () => {
    /* One Piece at zero is always in implied extra turns. If that
       blocked, the countdown would never fire for any timed game. */
    expect(intermissionFor(autoTimer(), TIME_AT + 3 * MIN)!.state).toBe("due");
  });
});

describe("the stale and the switched-off", () => {
  it("waits instead of starting when auto-start is off", () => {
    const manual = autoTimer({ autoStart: false });
    expect(intermissionFor(manual, TIME_AT + 3 * MIN)!.state).toBe("waiting");
  });

  it("waits instead of starting into a room nothing watched", () => {
    const at = TIME_AT + 3 * MIN + STALE_START_MS + 1000;
    expect(intermissionFor(autoTimer(), at)!.state).toBe("waiting");
  });

  it("turning Auto Mode off clears the remnants", () => {
    const held = apply(autoTimer(), holdAuto(autoTimer(), TIME_AT + MIN));
    const off = setAutoMode(held, false)!;

    expect(off.autoMode).toBe(false);
    expect(off.autoHeldAt).toBeNull();
    expect(off.intermissionExtendedMs).toBe(0);
  });

  it("clamps a nonsense intermission length", () => {
    expect(setIntermissionSeconds(autoTimer(), 5)!.intermissionSeconds).toBe(30);
    expect(setIntermissionSeconds(autoTimer(), 99999)!.intermissionSeconds).toBe(3600);
    expect(setIntermissionSeconds(autoTimer(), 180)).toBeNull();
  });
});

describe("reviving a round mid-intermission", () => {
  it("a judge's +1 min clears the old ending's remnants", () => {
    /* Time called by hand at 28:00, intermission counting, then a table
       is owed a minute. The round returns to the clock — and when it
       ends AGAIN, the intermission must anchor on the new ending, not
       auto-start instantly off the stale 28:00 call. */
    let t = autoTimer();
    t = apply(t, callTime(t, T0 + 28 * MIN));
    t = apply(t, holdAuto(t, T0 + 29 * MIN));

    const patch = adjust(t, MIN, T0 + 29 * MIN)!;
    expect(patch.status).toBe("running");
    expect(patch.timeCalledAt).toBeNull();
    expect(patch.autoHeldAt).toBeNull();
    expect(patch.intermissionExtendedMs).toBe(0);

    /* And the revived round's intermission is absent until it re-ends. */
    t = apply(t, patch);
    expect(intermissionFor(t, T0 + 29 * MIN + 30_000)).toBeNull();
  });

  it("the revived round's NEW ending anchors a fresh window", () => {
    let t = autoTimer();
    t = apply(t, callTime(t, T0 + 28 * MIN));
    t = apply(t, adjust(t, MIN, T0 + 28 * MIN));

    /* Reviving a called round shifts the start, so regulation re-ends
       at 36:00 — and the countdown anchors THERE, never on the stale
       28:00 hand call. */
    const between = intermissionFor(t, T0 + 36 * MIN + 30_000)!;
    expect(between.anchor).toBe(T0 + 36 * MIN);
    expect(between.remainingMs).toBe(150_000);
  });
});

describe("+2 min while held", () => {
  it("adds exactly two minutes to the frozen countdown", () => {
    /* Hold at 2:00 remaining, judge call runs eight minutes, then
       +2 MIN: the frozen clock reads 4:00 — never 2:00 plus the whole
       overdue span the wall clock accumulated during the hold. */
    let t = autoTimer();
    t = apply(t, holdAuto(t, TIME_AT + MIN));
    t = apply(t, extendAuto(t, TIME_AT + 9 * MIN));

    expect(intermissionFor(t, TIME_AT + 9 * MIN)!.remainingMs).toBe(4 * MIN);

    /* And resuming carries on from exactly that number. */
    t = apply(t, resumeAuto(t, TIME_AT + 10 * MIN));
    expect(intermissionFor(t, TIME_AT + 10 * MIN)!.remainingMs).toBe(4 * MIN);
  });

  it("a hold placed after the lapse extends from the frozen zero", () => {
    const waiting = autoTimer({ autoStart: false });
    let t = apply(waiting, holdAuto(waiting, TIME_AT + 5 * MIN));
    t = apply(t, extendAuto(t, TIME_AT + 8 * MIN));

    expect(intermissionFor(t, TIME_AT + 8 * MIN)!.remainingMs).toBe(EXTEND_MS);
  });
});

describe("the one-press next round", () => {
  it("works at time, with or without Auto Mode", () => {
    for (const auto of [true, false]) {
      const atTime = autoTimer({ autoMode: auto });
      const patch = advanceRound(atTime, TIME_AT + MIN)!;

      expect(patch.round).toBe(4);
      expect(patch.status).toBe("running");
      expect(patch.timeCalledAt).toBeNull();
      expect(patch.autoHeldAt).toBeNull();
      expect(patch.intermissionExtendedMs).toBe(0);
    }
  });

  it("refuses mid-round: 'next round' with time left is a mistap", () => {
    expect(advanceRound(autoTimer(), T0 + 10 * MIN)).toBeNull();
    expect(advanceRound(autoTimer({ status: "paused" }), T0 + 10 * MIN)).toBeNull();
    expect(
      advanceRound(autoTimer({ status: "ready", startedAt: null }), T0),
    ).toBeNull();
  });
});

describe("ends of the road", () => {
  it("never schedules anything for a round that was not played", () => {
    /* An accidental Call time on a READY timer must not arm a countdown
       toward a round nobody ran. */
    const ready = autoTimer({ status: "ready", startedAt: null });
    const called = apply(ready, callTime(ready, T0));

    expect(intermissionFor(called, T0 + MIN)).toBeNull();
    expect(startNextRound(called, T0 + 10 * MIN)).toBeNull();
  });

  it("stops at the round cap instead of restarting round 99 forever", () => {
    const last = autoTimer({ round: 99 });

    expect(intermissionFor(last, TIME_AT + MIN)).toBeNull();
    expect(startNextRound(last, TIME_AT + 3 * MIN)).toBeNull();
  });
});

describe("the next round is a clean slate", () => {
  it("a manual start clears the between-rounds remnants", () => {
    const messy = autoTimer({
      status: "time_called",
      timeCalledAt: new Date(TIME_AT).toISOString(),
      autoHeldAt: new Date(TIME_AT + MIN).toISOString(),
      intermissionExtendedMs: 4 * MIN,
    });

    const patch = start(messy, TIME_AT + 10 * MIN)!;
    expect(patch.timeCalledAt).toBeNull();
    expect(patch.autoHeldAt).toBeNull();
    expect(patch.intermissionExtendedMs).toBe(0);
  });

  it("a reset clears them too", () => {
    const messy = autoTimer({
      status: "time_called",
      timeCalledAt: new Date(TIME_AT).toISOString(),
      intermissionExtendedMs: 4 * MIN,
    });

    const patch = reset(messy)!;
    expect(patch.timeCalledAt).toBeNull();
    expect(patch.autoHeldAt).toBeNull();
    expect(patch.intermissionExtendedMs).toBe(0);
  });

  it("tournaments hold their own state: one intermission, one round", () => {
    const between = autoTimer();
    const running = autoTimer({
      id: "timer-2",
      startedAt: new Date(T0 + 20 * MIN).toISOString(),
      autoMode: false,
    });

    expect(intermissionFor(between, TIME_AT + MIN)).not.toBeNull();
    expect(intermissionFor(running, TIME_AT + MIN)).toBeNull();
  });
});
