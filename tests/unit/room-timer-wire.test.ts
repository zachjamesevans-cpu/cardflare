import { describe, expect, it } from "vitest";

import {
  readRoomTimer as appReadRoomTimer,
  type RoomTimerWire as AppWire,
} from "../../mobile/src/room-timer-wire";
import { readRoomTimer, type RoomTimerWire } from "@/lib/event-hub/room-timer-wire";

/**
 * The tournament clock on a phone.
 *
 * The wire carries instants and the phone does the arithmetic, so the
 * cases that matter are boundaries: the last second of regulation, the
 * moment it rolls into extra time with no fetch in between, and the cap
 * it settles on. The app has its own copy of the reader; the last block
 * walks both through every case so they cannot drift.
 */

const T0 = Date.parse("2026-08-27T19:00:00.000Z");
const MIN = 60_000;

function wire(overrides: Partial<RoomTimerWire> = {}): RoomTimerWire {
  return {
    id: "timer-1",
    game: "one-piece",
    gameName: "One Piece",
    eventName: "Friday Night Locals",
    round: 3,
    phase: "running",
    headline: "+3 TURNS · 5:00",
    endsAt: null,
    overtimeSinceAt: null,
    overtimeCapMs: null,
    untimedSinceAt: null,
    staticMs: null,
    ...overrides,
  };
}

/** A regulation round with 35:00 on the clock, started at T0. */
function runningRound(): RoomTimerWire {
  return wire({
    endsAt: new Date(T0 + 35 * MIN).toISOString(),
    overtimeCapMs: 5 * MIN,
  });
}

describe("readRoomTimer", () => {
  it("counts regulation down from the end instant", () => {
    const reading = readRoomTimer(runningRound(), T0 + 20 * MIN);
    expect(reading.clock).toBe("15:00");
    expect(reading.label).toBe("In round");
    expect(reading.atTime).toBe(false);
  });

  it("rolls into extra time on its own, counting up", () => {
    /* No refetch between these two readings — the same wire crosses
       the boundary on the phone's own clock. */
    const round = runningRound();

    expect(readRoomTimer(round, T0 + 35 * MIN - 1000).atTime).toBe(false);

    const after = readRoomTimer(round, T0 + 36 * MIN);
    expect(after.clock).toBe("01:00");
    expect(after.label).toBe("Extra time");
    expect(after.atTime).toBe(true);
  });

  it("settles on the cap once extra time runs out", () => {
    const reading = readRoomTimer(runningRound(), T0 + 45 * MIN);
    expect(reading.clock).toBe("05:00");
    expect(reading.label).toBe("Extra time over");
    expect(reading.atTime).toBe(true);
  });

  it("shows TIME with no clock where the procedure counts turns", () => {
    const lorcana = wire({
      gameName: "Lorcana",
      headline: "+5 TURNS",
      endsAt: new Date(T0 + 50 * MIN).toISOString(),
      overtimeCapMs: null,
    });

    const reading = readRoomTimer(lorcana, T0 + 51 * MIN);
    expect(reading.clock).toBe("0:00");
    expect(reading.label).toBe("Time in round");
    expect(reading.atTime).toBe(true);
  });

  it("reads a hand-started overtime clock the same way", () => {
    const manual = wire({
      phase: "overtime",
      overtimeSinceAt: new Date(T0).toISOString(),
      overtimeCapMs: 5 * MIN,
    });

    expect(readRoomTimer(manual, T0 + 2 * MIN).clock).toBe("02:00");
    expect(readRoomTimer(manual, T0 + 2 * MIN).atTime).toBe(true);
    expect(readRoomTimer(manual, T0 + 9 * MIN).label).toBe("Extra time over");
  });

  it("counts an untimed round up", () => {
    const untimed = wire({ untimedSinceAt: new Date(T0).toISOString() });
    const reading = readRoomTimer(untimed, T0 + 12 * MIN);

    expect(reading.clock).toBe("12:00");
    expect(reading.atTime).toBe(false);
  });

  it("holds still while paused", () => {
    const paused = wire({ phase: "paused", staticMs: 7 * MIN });
    const now = readRoomTimer(paused, T0);
    const later = readRoomTimer(paused, T0 + 30 * MIN);

    expect(now.clock).toBe("07:00");
    expect(later.clock).toBe("07:00");
    expect(later.label).toBe("Paused");
  });
});

describe("the app reads the wire the same way", () => {
  const CASES: [string, RoomTimerWire, number][] = [
    ["mid-regulation", runningRound(), T0 + 20 * MIN],
    ["the last second", runningRound(), T0 + 35 * MIN - 1000],
    ["into extra time", runningRound(), T0 + 36 * MIN],
    ["past the cap", runningRound(), T0 + 45 * MIN],
    [
      "turn-counted time",
      wire({ endsAt: new Date(T0 + 50 * MIN).toISOString() }),
      T0 + 51 * MIN,
    ],
    [
      "manual overtime",
      wire({
        phase: "overtime",
        overtimeSinceAt: new Date(T0).toISOString(),
        overtimeCapMs: 5 * MIN,
      }),
      T0 + 2 * MIN,
    ],
    ["untimed", wire({ untimedSinceAt: new Date(T0).toISOString() }), T0 + 12 * MIN],
    ["paused", wire({ phase: "paused", staticMs: 7 * MIN }), T0 + 30 * MIN],
  ];

  it.each(CASES)("agrees at %s", (_label, sample, at) => {
    expect(appReadRoomTimer(sample as AppWire, at)).toEqual(readRoomTimer(sample, at));
  });
});
