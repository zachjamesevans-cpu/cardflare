import { describe, expect, it } from "vitest";

import {
  adjust,
  advanceTurn,
  callTime,
  complete,
  elapsedMs,
  formatClock,
  overtimeCapMs,
  overtimeElapsedMs,
  overtimeRemainingMs,
  pause,
  remainingMs,
  reset,
  setRulesDismissed,
  showsOvertimeRules,
  speakClock,
  start,
  startOvertime,
  timerPhase,
  urgency,
  type HubTimer,
} from "@/lib/event-hub/timer";

/**
 * The timer, which is the whole feature.
 *
 * These are the failures that actually happen in a shop: the television
 * gets refreshed, the wifi drops for a minute, two staff phones both tap
 * START, and one tournament reaches zero while another has twenty
 * minutes left. All of them are arithmetic, so all of them are testable
 * without a browser, a database or a clock.
 */

const T0 = Date.parse("2026-08-18T19:00:00.000Z");
const MIN = 60_000;

function timer(overrides: Partial<HubTimer> = {}): HubTimer {
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
    status: "ready",
    startedAt: null,
    pausedAt: null,
    remainingMsWhenPaused: null,
    overtimeStartedAt: null,
    overtimeDurationSeconds: null,
    overtimeTurn: 0,
    rulesDismissed: false,
    updatedAt: new Date(T0).toISOString(),
    ...overrides,
  };
}

/** Applies a patch the way the repository would, so a test is one story. */
function apply(current: HubTimer, patch: ReturnType<typeof start>): HubTimer {
  return patch ? { ...current, ...patch } : current;
}

describe("starting, pausing and resuming", () => {
  it("counts down from the moment it started", () => {
    const running = apply(timer(), start(timer(), T0));

    expect(running.status).toBe("running");
    expect(remainingMs(running, T0)).toBe(35 * MIN);
    expect(remainingMs(running, T0 + 10 * MIN)).toBe(25 * MIN);
  });

  it("keeps its remaining time across a pause", () => {
    let t = apply(timer(), start(timer(), T0));
    t = apply(t, pause(t, T0 + 12 * MIN));

    expect(t.status).toBe("paused");
    expect(remainingMs(t, T0 + 12 * MIN)).toBe(23 * MIN);

    /* The whole point: five minutes of real time pass while paused and
       the round does not lose them. */
    expect(remainingMs(t, T0 + 17 * MIN)).toBe(23 * MIN);
  });

  it("resumes where it stopped, however long the pause was", () => {
    let t = apply(timer(), start(timer(), T0));
    t = apply(t, pause(t, T0 + 12 * MIN));
    t = apply(t, start(t, T0 + 20 * MIN));

    expect(t.status).toBe("running");
    expect(remainingMs(t, T0 + 20 * MIN)).toBe(23 * MIN);
    expect(remainingMs(t, T0 + 25 * MIN)).toBe(18 * MIN);
  });

  it("refuses a second start, so two staff phones cannot restart a round", () => {
    const running = apply(timer(), start(timer(), T0));

    /* Null is "write nothing", which is what makes a double tap, a
       second control tab and a retried request all harmless. */
    expect(start(running, T0 + 5 * MIN)).toBeNull();
  });

  it("refuses to pause something that is not running", () => {
    expect(pause(timer(), T0)).toBeNull();
    expect(pause(timer({ status: "complete" }), T0)).toBeNull();
  });

  it("survives a refresh, because nothing about it lives in the page", () => {
    const running = apply(timer(), start(timer(), T0));

    /* A refresh re-reads exactly this row. Same row, later clock, right
       answer — there is no client state to lose. */
    const afterRefresh = { ...running };
    expect(remainingMs(afterRefresh, T0 + 8 * MIN)).toBe(27 * MIN);
  });

  it("restores the right time after the wifi comes back", () => {
    const running = apply(timer(), start(timer(), T0));

    /* Four minutes offline. The row never changed, so neither did the
       answer — a display catches up rather than resyncing. */
    expect(remainingMs(running, T0 + 4 * MIN)).toBe(31 * MIN);
  });

  it("resets everything, overtime included", () => {
    let t = apply(timer(), start(timer(), T0));
    t = apply(t, startOvertime(t, T0 + 35 * MIN, 5 * 60));
    t = apply(t, reset(t));

    expect(t.status).toBe("ready");
    expect(t.startedAt).toBeNull();
    expect(t.overtimeStartedAt).toBeNull();
    expect(t.overtimeTurn).toBe(0);
    expect(remainingMs(t, T0 + 40 * MIN)).toBe(35 * MIN);
  });
});

describe("adding and taking away time", () => {
  it("gives a judge their extra minute mid-round", () => {
    let t = apply(timer(), start(timer(), T0));
    t = apply(t, adjust(t, MIN, T0 + 10 * MIN));

    expect(remainingMs(t, T0 + 10 * MIN)).toBe(26 * MIN);
  });

  it("takes a minute off without going negative", () => {
    let t = apply(timer(), start(timer(), T0));
    t = apply(t, adjust(t, -MIN, T0 + 34 * MIN + 50_000));

    /* Ten seconds left minus a minute is zero, not minus fifty seconds
       counting back up. */
    expect(remainingMs(t, T0 + 34 * MIN + 50_000)).toBe(0);
  });

  it("edits the length before the round starts", () => {
    const t = apply(timer(), adjust(timer(), 5 * MIN, T0));

    expect(t.durationSeconds).toBe(40 * 60);
    expect(t.status).toBe("ready");
  });

  it("adjusts a paused round without resuming it", () => {
    let t = apply(timer(), start(timer(), T0));
    t = apply(t, pause(t, T0 + 30 * MIN));
    t = apply(t, adjust(t, 2 * MIN, T0 + 31 * MIN));

    expect(t.status).toBe("paused");
    expect(remainingMs(t, T0 + 40 * MIN)).toBe(7 * MIN);
  });

  it("puts a round that already hit zero back on the clock", () => {
    let t = apply(timer(), start(timer(), T0));
    expect(timerPhase(t, T0 + 35 * MIN)).toBe("overtime");

    t = apply(t, adjust(t, 2 * MIN, T0 + 35 * MIN));
    expect(timerPhase(t, T0 + 35 * MIN)).toBe("running");
    expect(remainingMs(t, T0 + 35 * MIN)).toBe(2 * MIN);
  });
});

describe("phases and urgency", () => {
  it("rolls a timed procedure straight into extra time at zero", () => {
    const running = apply(timer(), start(timer(), T0));

    /* The reason this is derived: a staff phone may be asleep at 19:35,
       and the television still has to flip at 19:35. The founder's
       correction is WHAT it flips to — "Immediately start the 5 min
       overtime timer", not TIME IN ROUND with a button to press. */
    expect(timerPhase(running, T0 + 34 * MIN)).toBe("running");
    expect(timerPhase(running, T0 + 35 * MIN)).toBe("overtime");
    expect(running.status).toBe("running");
  });

  it("still calls TIME at zero where the procedure counts turns", () => {
    const lorcana = timer({ game: "lorcana", presetId: "swiss" });
    const running = apply(lorcana, start(lorcana, T0));

    /* Lorcana has no extra-time clock to start, so zero is still TIME
       IN ROUND and the steps card. */
    expect(timerPhase(running, T0 + 35 * MIN)).toBe("time_called");
  });

  it("does not invent a clock for a preset that declines one", () => {
    /* Pokémon prerelease deliberately carries no overtime — "follow
       your event's own end-of-round rules" — even though the
       championship procedure is timed. */
    const prerelease = timer({
      game: "pokemon",
      presetId: "prerelease-bo1",
      durationSeconds: 30 * 60,
    });
    const running = apply(prerelease, start(prerelease, T0));

    expect(timerPhase(running, T0 + 30 * MIN)).toBe("time_called");
    expect(overtimeCapMs(running, T0 + 30 * MIN)).toBeNull();
  });

  it("takes the preset's own overtime length over the procedure's", () => {
    /* Top Cut runs 10:00 extra where the store procedure says 5:00. */
    const topCut = timer({ presetId: "top-cut", durationSeconds: 60 * 60 });
    const running = apply(topCut, start(topCut, T0));

    expect(timerPhase(running, T0 + 66 * MIN)).toBe("overtime");
    expect(overtimeCapMs(running, T0 + 66 * MIN)).toBe(10 * MIN);
    expect(timerPhase(running, T0 + 70 * MIN)).toBe("overtime_expired");
  });

  it.each([
    [20 * MIN, "none"],
    [10 * MIN, "none"],
    [10 * MIN - 1, "ten"],
    [5 * MIN, "ten"],
    [5 * MIN - 1, "five"],
    [MIN, "five"],
    [MIN - 1, "one"],
    [1_000, "one"],
  ])("with %i ms left the band is %s", (left, band) => {
    const running = apply(timer(), start(timer(), T0));
    expect(urgency(running, T0 + 35 * MIN - left)).toBe(band);
  });

  it("is never urgent while paused", () => {
    let t = apply(timer(), start(timer(), T0));
    t = apply(t, pause(t, T0 + 34 * MIN + 30_000));

    expect(urgency(t, T0 + 40 * MIN)).toBe("none");
  });

  it("shows the rules card from time until staff put it away", () => {
    let t = apply(timer(), start(timer(), T0));
    expect(showsOvertimeRules(t, T0 + 35 * MIN)).toBe(true);

    t = apply(t, setRulesDismissed(t, true));
    expect(showsOvertimeRules(t, T0 + 35 * MIN)).toBe(false);

    t = apply(t, setRulesDismissed(t, false));
    expect(showsOvertimeRules(t, T0 + 35 * MIN)).toBe(true);
  });

  it("marks complete and stops showing anything", () => {
    let t = apply(timer(), start(timer(), T0));
    t = apply(t, complete(t));

    expect(timerPhase(t, T0 + 40 * MIN)).toBe("complete");
    expect(showsOvertimeRules(t, T0 + 40 * MIN)).toBe(false);
    expect(start(t, T0 + 41 * MIN)).toBeNull();
  });
});

describe("overtime", () => {
  it("counts extra time UP from the instant regulation ended", () => {
    /* Nothing written, no button pressed — the whole point. And UP, not
       down: "count UP to 5:00 for one piece and other TCG's". */
    const t = apply(timer(), start(timer(), T0));

    expect(overtimeElapsedMs(t, T0 + 35 * MIN)).toBe(0);
    expect(overtimeElapsedMs(t, T0 + 36 * MIN)).toBe(MIN);
    expect(overtimeCapMs(t, T0 + 36 * MIN)).toBe(5 * MIN);
    expect(overtimeRemainingMs(t, T0 + 38 * MIN)).toBe(2 * MIN);
    /* Clamped at the cap: the wall settles on 5:00, never 5:01. */
    expect(overtimeElapsedMs(t, T0 + 45 * MIN)).toBe(5 * MIN);
    expect(timerPhase(t, T0 + 40 * MIN)).toBe("overtime_expired");
  });

  it("runs a hand-started clock after an early time call", () => {
    let t = apply(timer(), start(timer(), T0));
    t = apply(t, callTime(t, T0 + 30 * MIN));
    expect(t.status).toBe("time_called");

    t = apply(t, startOvertime(t, T0 + 30 * MIN, 5 * 60));
    expect(t.status).toBe("overtime");
    expect(overtimeElapsedMs(t, T0 + 32 * MIN)).toBe(2 * MIN);
    expect(overtimeRemainingMs(t, T0 + 32 * MIN)).toBe(3 * MIN);
  });

  it("never restarts a clock that is already running", () => {
    let t = apply(timer(), start(timer(), T0));
    t = apply(t, callTime(t, T0 + 30 * MIN));
    t = apply(t, startOvertime(t, T0 + 30 * MIN, 5 * 60));

    /* The guard that matters: two staff phones, both tapping START
       OVERTIME, must not put five minutes back on a clock with two left. */
    expect(startOvertime(t, T0 + 33 * MIN, 5 * 60)).toBeNull();
    expect(overtimeRemainingMs(t, T0 + 33 * MIN)).toBe(2 * MIN);
  });

  it("refuses START OVERTIME on a clock that rolled over by itself", () => {
    /* Derived extra time leaves the row saying "running"; a stale
       control tab's button must not restart a clock two minutes in. */
    const t = apply(timer(), start(timer(), T0));
    expect(timerPhase(t, T0 + 37 * MIN)).toBe("overtime");
    expect(startOvertime(t, T0 + 37 * MIN, 5 * 60)).toBeNull();
    expect(overtimeElapsedMs(t, T0 + 37 * MIN)).toBe(2 * MIN);
  });

  it("cannot be paused or called back once extra time is running", () => {
    const t = apply(timer(), start(timer(), T0));
    expect(pause(t, T0 + 36 * MIN)).toBeNull();
    expect(callTime(t, T0 + 36 * MIN)).toBeNull();
  });

  it("has no clock at all when the procedure counts turns", () => {
    let t = apply(
      timer({ game: "lorcana", presetId: "swiss", durationSeconds: 50 * 60 }),
      start(timer({ game: "lorcana" }), T0),
    );
    t = apply(t, startOvertime(t, T0 + 50 * MIN, null));

    expect(t.status).toBe("overtime");
    /* Null, not zero. Inventing a countdown for Lorcana would put a rule
       on a shop's wall that the publisher never wrote. */
    expect(overtimeRemainingMs(t, T0 + 55 * MIN)).toBeNull();
    expect(timerPhase(t, T0 + 90 * MIN)).toBe("overtime");
  });

  it("advances turns only when staff say so", () => {
    let t = apply(timer(), startOvertime(timer(), T0, 5 * 60));

    t = apply(t, advanceTurn(t, 3, 1, T0));
    expect(t.overtimeTurn).toBe(1);

    t = apply(t, advanceTurn(t, 3, 1, T0));
    t = apply(t, advanceTurn(t, 3, 1, T0));
    expect(t.overtimeTurn).toBe(3);

    /* Capped at the procedure's own count — "Turn 4 of 3" is not a thing. */
    expect(advanceTurn(t, 3, 1, T0)).toBeNull();

    t = apply(t, advanceTurn(t, 3, -1, T0));
    expect(t.overtimeTurn).toBe(2);
  });

  it("advances turns the moment the rules card appears, not only after START", () => {
    /*
     * The bug this pins, reported from a shop floor: "the turn up and
     * down button does not work in One Piece when a tournament goes to
     * overtime."
     *
     * Regulation reaching zero is a DERIVED phase — the wall says TIME
     * IN ROUND with no row written — but the row still says "running"
     * until staff confirm it. The guard here read the row, so the turn
     * buttons were dead in exactly the moment they first appear.
     */
    const running = apply(timer(), start(timer(), T0));
    const atTime = T0 + 36 * MIN;

    expect(running.status).toBe("running");
    expect(timerPhase(running, atTime)).toBe("overtime");

    expect(advanceTurn(running, 3, 1, atTime)).toEqual({ overtimeTurn: 1 });
  });

  it("still refuses to advance a turn while the round is running", () => {
    const running = apply(timer(), start(timer(), T0));
    expect(advanceTurn(running, 3, 1, T0 + 10 * MIN)).toBeNull();
  });

  it("takes a turn back, so a miscount is not permanent", () => {
    let t = apply(timer(), startOvertime(timer(), T0, 5 * 60));
    t = apply(t, advanceTurn(t, 3, 1, T0));
    t = apply(t, advanceTurn(t, 3, 1, T0));
    expect(t.overtimeTurn).toBe(2);

    t = apply(t, advanceTurn(t, 3, -1, T0));
    expect(t.overtimeTurn).toBe(1);

    t = apply(t, advanceTurn(t, 3, -1, T0));
    expect(t.overtimeTurn).toBe(0);
    /* And never below zero. */
    expect(advanceTurn(t, 3, -1, T0)).toBeNull();
  });

  it("hides the rules card at time, before overtime has been started", () => {
    /* The other half of the same report. Hiding has to work while the
       row still says "running", which is when staff first reach for it. */
    const running = apply(timer(), start(timer(), T0));
    const atTime = T0 + 36 * MIN;

    expect(showsOvertimeRules(running, atTime)).toBe(true);

    const hidden = apply(running, setRulesDismissed(running, true));
    expect(showsOvertimeRules(hidden, atTime)).toBe(false);

    const shown = apply(hidden, setRulesDismissed(hidden, false));
    expect(showsOvertimeRules(shown, atTime)).toBe(true);
  });

  it("does not track turns for a procedure that has none", () => {
    const t = apply(timer(), startOvertime(timer(), T0, 5 * 60));
    expect(advanceTurn(t, 0, 1, T0)).toBeNull();
  });

  it("stretches a timed overtime when a judge asks", () => {
    let t = apply(timer(), startOvertime(timer(), T0, 5 * 60));
    t = apply(t, adjust(t, MIN, T0 + MIN));

    expect(overtimeRemainingMs(t, T0 + MIN)).toBe(5 * MIN);
  });
});

describe("two tournaments at once", () => {
  it("lets one reach overtime while the other carries on", () => {
    /* The vertical slice, as arithmetic. One Piece at 35 minutes and
       Flesh and Blood at 55, both started together. */
    const onePiece = apply(timer(), start(timer(), T0));
    const fab = apply(
      timer({ id: "timer-2", game: "flesh-and-blood", durationSeconds: 55 * 60 }),
      start(timer({ id: "timer-2", durationSeconds: 55 * 60 }), T0),
    );

    const at = T0 + 35 * MIN;

    expect(timerPhase(onePiece, at)).toBe("overtime");
    expect(showsOvertimeRules(onePiece, at)).toBe(true);

    expect(timerPhase(fab, at)).toBe("running");
    expect(showsOvertimeRules(fab, at)).toBe(false);
    expect(remainingMs(fab, at)).toBe(20 * MIN);
  });

  it("keeps one timer's overtime out of the other's row entirely", () => {
    /* Derived extra time writes NOTHING, so there is nothing that could
       leak into the other row in the first place. */
    const onePiece = apply(timer(), start(timer(), T0));
    const fab = apply(
      timer({ id: "timer-2", durationSeconds: 55 * 60 }),
      start(timer({ id: "timer-2", durationSeconds: 55 * 60 }), T0),
    );

    expect(timerPhase(onePiece, T0 + 36 * MIN)).toBe("overtime");
    expect(onePiece.overtimeStartedAt).toBeNull();
    expect(fab.status).toBe("running");
    expect(fab.overtimeStartedAt).toBeNull();
  });
});

describe("untimed rounds", () => {
  it("counts up instead of down", () => {
    const untimed = timer({
      game: "riftbound",
      presetId: "playoff",
      durationSeconds: null,
    });
    const running = apply(untimed, start(untimed, T0));

    expect(remainingMs(running, T0 + 10 * MIN)).toBeNull();
    expect(elapsedMs(running, T0 + 10 * MIN)).toBe(10 * MIN);
    /* Never "time called" — an untimed round has no zero to reach. */
    expect(timerPhase(running, T0 + 10 * MIN)).toBe("running");
  });

  it("holds its elapsed time across a pause and resume", () => {
    const untimed = timer({ durationSeconds: null });
    let t = apply(untimed, start(untimed, T0));
    t = apply(t, pause(t, T0 + 9 * MIN));

    expect(elapsedMs(t, T0 + 20 * MIN)).toBe(9 * MIN);

    t = apply(t, start(t, T0 + 20 * MIN));
    expect(elapsedMs(t, T0 + 20 * MIN)).toBe(9 * MIN);
    expect(elapsedMs(t, T0 + 22 * MIN)).toBe(11 * MIN);
  });
});

describe("reading the clock", () => {
  it.each([
    [35 * MIN, "35:00"],
    [90_000, "01:30"],
    [999, "00:01"],
    [0, "00:00"],
    [60 * MIN, "1:00:00"],
  ])("renders %i as %s", (ms, shown) => {
    expect(formatClock(ms)).toBe(shown);
  });

  it("says the time in words for a screen reader", () => {
    expect(speakClock(90_000)).toBe("1 minute 30 seconds remaining");
    expect(speakClock(60_000)).toBe("1 minute remaining");
    expect(speakClock(null)).toBe("untimed");
  });

  it("does not invent a call to time from a hand-edited row", () => {
    /* A running row with no start stamp cannot happen through the
       actions, but it must not render NaN on a wall if it ever does. */
    const broken = timer({ status: "running", startedAt: null });
    expect(remainingMs(broken, T0)).toBe(35 * MIN);
    expect(formatClock(remainingMs(broken, T0))).toBe("35:00");
  });

  it("calls time by hand before the clock gets there", () => {
    const running = apply(timer(), start(timer(), T0));
    const called = apply(running, callTime(running, T0 + 5 * MIN));

    expect(timerPhase(called, T0 + 5 * MIN)).toBe("time_called");
    expect(callTime(called, T0 + 5 * MIN)).toBeNull();
  });
});
