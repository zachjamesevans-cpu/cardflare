/**
 * The tournament clock, sized for a phone in a pocket.
 *
 * The founder: "you scan into a room, that room shows the timer for the
 * ongoing tournament live, so if you step out or can't see the screen,
 * you can quickly check the timer on your phone."
 *
 * The wire carries INSTANTS, never a countdown: the same design as the
 * television. The server says when regulation ends and when extra time
 * began, and every phone works the display out from its own clock — so
 * the number is right between polls, ticks with no traffic at all, and
 * even rolls from regulation into extra time on its own if the phone
 * sits on the screen across the boundary.
 *
 * Free of imports on purpose. `mobile/src/room-timer-wire.ts` is the
 * app's copy, and `tests/unit/room-timer-wire.test.ts` imports both
 * and walks the same cases through each.
 */

export interface RoomTimerWire {
  id: string;
  /** The game's slug, e.g. "one-piece" — also the Flare search scope. */
  game: string;
  /** The game's short display name, e.g. "One Piece". */
  gameName: string;
  eventName: string;
  round: number | null;
  phase: "running" | "paused" | "time_called" | "overtime" | "overtime_expired";
  /** The procedure's one-liner, shown at time: "+3 TURNS · 5:00". */
  headline: string;
  /** Regulation's end instant, for a running timed round. */
  endsAt: string | null;
  /** When extra time began, for a hand-started overtime clock. */
  overtimeSinceAt: string | null;
  /** What extra time climbs to, in ms. Null = the procedure counts turns. */
  overtimeCapMs: number | null;
  /** When an untimed round began: it counts up instead. */
  untimedSinceAt: string | null;
  /** A clock that is not moving: paused, or time called with no extra clock. */
  staticMs: number | null;
  /**
   * Auto Mode's between-rounds target, while the countdown is running.
   * The phone counts down to it: "Round 4 in 2:34". Absent while held,
   * waiting, or blocked — those are conversations for the organizer,
   * not the room.
   */
  nextRoundAt: string | null;
  /** The round that target starts. */
  nextRound: number | null;
}

export interface RoomTimerReading {
  /** What the digits say. */
  clock: string;
  /** The word beside them: "In round", "Extra time", "Paused"… */
  label: string;
  /** True from the moment regulation ends — the phone shows red too. */
  atTime: boolean;
}

function fmt(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");

  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(Math.floor(total / 60))}:${pad(seconds)}`;
}

function stamp(iso: string | null): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

/** What this phone should show right now, from its own clock. */
export function readRoomTimer(wire: RoomTimerWire, now: number): RoomTimerReading {
  /* The between-rounds countdown speaks first: once time has hit and
     Auto Mode is counting toward the next round, "Round 4 in 2:34" is
     the answer a player between matches actually wants. Past the target
     the phone falls through to whatever the round itself is showing. */
  const nextRoundAt = stamp(wire.nextRoundAt);
  if (nextRoundAt !== null && nextRoundAt > now) {
    return {
      clock: fmt(nextRoundAt - now),
      label: wire.nextRound !== null ? `Round ${wire.nextRound} in` : "Next round in",
      atTime: false,
    };
  }

  const overtimeSince = stamp(wire.overtimeSinceAt);
  if (overtimeSince !== null) {
    const raw = Math.max(0, now - overtimeSince);
    const up = wire.overtimeCapMs === null ? raw : Math.min(raw, wire.overtimeCapMs);
    const over = wire.overtimeCapMs !== null && raw >= wire.overtimeCapMs;
    return {
      clock: fmt(up),
      label: over ? "Extra time over" : "Extra time",
      atTime: true,
    };
  }

  const endsAt = stamp(wire.endsAt);
  if (endsAt !== null) {
    const left = endsAt - now;
    if (left > 0) return { clock: fmt(left), label: "In round", atTime: false };

    /* Regulation over. A timed procedure rolls into a count-up right
       here on the phone, exactly as the wall does. */
    if (wire.overtimeCapMs !== null) {
      const up = Math.min(-left, wire.overtimeCapMs);
      return {
        clock: fmt(up),
        label: -left >= wire.overtimeCapMs ? "Extra time over" : "Extra time",
        atTime: true,
      };
    }
    return { clock: "0:00", label: "Time in round", atTime: true };
  }

  const untimedSince = stamp(wire.untimedSinceAt);
  if (untimedSince !== null) {
    return {
      clock: fmt(Math.max(0, now - untimedSince)),
      label: "In round",
      atTime: false,
    };
  }

  const atTime =
    wire.phase === "time_called" ||
    wire.phase === "overtime" ||
    wire.phase === "overtime_expired";
  return {
    clock: fmt(wire.staticMs ?? 0),
    label: atTime ? "Time in round" : wire.phase === "paused" ? "Paused" : "In round",
    atTime,
  };
}
