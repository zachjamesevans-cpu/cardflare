import { describe, expect, it } from "vitest";

import { timerWire } from "@/lib/event-hub/room-timers";
import {
  isStaleTimer,
  reset,
  STALE_TIMER_MS,
  type HubTimer,
} from "@/lib/event-hub/timer";

/**
 * The overnight failsafe.
 *
 * The founder, opening a room at Mox Valley four days after an event:
 * the timer was still there, red, at "Extra time over". Stores do not
 * close timers out at the end of a night, so the system has to — a
 * finished round goes stale after six quiet hours, disappears from the
 * room at once, and resets to Ready on the console's next read.
 */

const T0 = Date.parse("2026-08-27T19:00:00.000Z");
const MIN = 60_000;
const HOUR = 60 * MIN;

function timer(overrides: Partial<HubTimer> = {}): HubTimer {
  return {
    id: "timer-1",
    displayId: "display-1",
    position: 0,
    game: "one-piece",
    eventName: "Store Tournament",
    round: 1,
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
    autoMode: false,
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

/** Four days on: the founder's actual screenshot. */
const DAYS_LATER = TIME_AT + 4 * 24 * HOUR;

describe("what goes stale", () => {
  it("a round that hit time and was never closed", () => {
    expect(isStaleTimer(timer(), TIME_AT + STALE_TIMER_MS + MIN)).toBe(true);
    expect(isStaleTimer(timer(), DAYS_LATER)).toBe(true);
  });

  it("an explicit overtime nobody resolved", () => {
    const overtime = timer({
      status: "overtime",
      overtimeStartedAt: new Date(TIME_AT).toISOString(),
      overtimeDurationSeconds: 300,
    });

    expect(isStaleTimer(overtime, DAYS_LATER)).toBe(true);
  });

  it("a hand call left overnight, measured from the call", () => {
    const called = timer({
      status: "time_called",
      timeCalledAt: new Date(T0 + 20 * MIN).toISOString(),
    });

    expect(isStaleTimer(called, T0 + 20 * MIN + STALE_TIMER_MS - MIN)).toBe(false);
    expect(isStaleTimer(called, T0 + 20 * MIN + STALE_TIMER_MS + MIN)).toBe(true);
  });

  it("a pause the store walked away from", () => {
    const paused = timer({
      status: "paused",
      pausedAt: new Date(T0 + 10 * MIN).toISOString(),
      remainingMsWhenPaused: 25 * 60_000,
    });

    expect(isStaleTimer(paused, DAYS_LATER)).toBe(true);
  });

  it("an untimed round counting up into the small hours", () => {
    const untimed = timer({ durationSeconds: null });
    expect(isStaleTimer(untimed, T0 + STALE_TIMER_MS + MIN)).toBe(true);
  });

  it("a held Auto Mode intermission everybody went home on", () => {
    const held = timer({
      autoMode: true,
      autoHeldAt: new Date(TIME_AT + MIN).toISOString(),
    });

    expect(isStaleTimer(held, DAYS_LATER)).toBe(true);
  });
});

describe("what never goes stale", () => {
  it("a timed round still counting down, whatever its age", () => {
    /* An eight-hour custom round is legitimate, and hiding a LIVE
       countdown would be the worse bug. */
    const long = timer({ durationSeconds: 8 * 3600 });
    expect(isStaleTimer(long, T0 + 7 * HOUR)).toBe(false);
  });

  it("a round freshly at time", () => {
    expect(isStaleTimer(timer(), TIME_AT + 10 * MIN)).toBe(false);
  });

  it("ready and finished rounds, which have nothing to expire", () => {
    expect(isStaleTimer(timer({ status: "ready", startedAt: null }), DAYS_LATER)).toBe(
      false,
    );
    expect(isStaleTimer(timer({ status: "complete" }), DAYS_LATER)).toBe(false);
  });
});

describe("what the failsafe does", () => {
  it("drops a stale timer from the room wire at once, no write needed", () => {
    /* The founder's screenshot: the phone must be clean the moment it
       looks, whether or not any console has run the reset yet. */
    expect(timerWire(timer(), TIME_AT + 10 * MIN)).not.toBeNull();
    expect(timerWire(timer(), DAYS_LATER)).toBeNull();
  });

  it("resets to Ready with every remnant cleared", () => {
    const abandoned = timer({
      autoMode: true,
      timeCalledAt: new Date(TIME_AT).toISOString(),
      status: "time_called",
      autoHeldAt: new Date(TIME_AT + MIN).toISOString(),
      intermissionExtendedMs: 4 * MIN,
    });

    const patch = reset(abandoned)!;
    expect(patch.status).toBe("ready");
    expect(patch.startedAt).toBeNull();
    expect(patch.timeCalledAt).toBeNull();
    expect(patch.autoHeldAt).toBeNull();
    expect(patch.intermissionExtendedMs).toBe(0);
    /* The SETTING survives: tomorrow's tournament is still Auto Mode. */
    expect(patch.autoMode).toBeUndefined();
  });
});
