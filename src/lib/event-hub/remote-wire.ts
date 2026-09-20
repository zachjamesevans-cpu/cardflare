import type { RoomTimerWire } from "./room-timer-wire";

/**
 * A timer as the REMOTE sees it: what the wall shows, plus what an
 * organizer may do about it.
 *
 * The founder: "having someone being able to control the round timers
 * on the phone app... like a 'remote' in a way." The phone is never
 * the source of the countdown. It reads the same instants the
 * television reads (`wire`) and ticks from its own clock, so a phone
 * asleep in a pocket changes nothing on the wall. What this adds is
 * the state a button needs to know whether it applies, and who last
 * pressed one, for the other organizer's screen.
 *
 * Plain module: no server imports, so the app carries the same file
 * (mobile/src/remote-wire.ts) and a test can hold the two together.
 */

export type RemoteTimerStatus =
  "ready" | "running" | "paused" | "time_called" | "overtime" | "complete";

export interface RemoteTimer {
  id: string;
  displayId: string;
  displayName: string;
  game: string;
  gameName: string;
  eventName: string;
  round: number;
  /** What staff last decided. */
  status: RemoteTimerStatus;
  /** What the wall shows right now, or null when there is nothing on it. */
  wire: RoomTimerWire | null;
  /** The round length, so Reset can say what it resets to. */
  regulationMs: number;
  /** Extra time is counted in turns rather than minutes. */
  turnCounted: boolean;
  auto: {
    enabled: boolean;
    autoStart: boolean;
    /** The between-rounds countdown is running. */
    counting: boolean;
    /** Somebody pressed Hold. */
    held: boolean;
    nextRoundAt: string | null;
    nextRound: number | null;
    intermissionSeconds: number;
  };
  /** Who last pressed a control, and when. Null before anybody has. */
  controlledBy: string | null;
  controlledAt: string | null;
  updatedAt: string;
}

export interface RemoteDisplay {
  id: string;
  name: string;
  timers: RemoteTimer[];
}

/** One press on the remote. Same words the console's buttons send. */
export const REMOTE_OPS = [
  "start",
  "pause",
  "reset",
  "add-minute",
  "subtract-minute",
  "call-time",
  "start-overtime",
  "next-turn",
  "previous-turn",
  "complete",
  "auto-on",
  "auto-off",
  "auto-hold",
  "auto-resume",
  "auto-extend",
  "next-round",
  "auto-start-now",
] as const;

export type RemoteOp = (typeof REMOTE_OPS)[number];

export const isRemoteOp = (value: unknown): value is RemoteOp =>
  typeof value === "string" && (REMOTE_OPS as readonly string[]).includes(value);
