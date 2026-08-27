"use client";

import { useEffect, useState } from "react";
import { TimerIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { roomTimersAction } from "@/lib/event-hub/room-timer-actions";
import { readRoomTimer, type RoomTimerWire } from "@/lib/event-hub/room-timer-wire";

/**
 * The wall's clocks, in a pocket.
 *
 * The founder: "if you step out or can't see the screen, you can
 * quickly check the timer on your phone... it should refresh live
 * along with how the flare refreshes work." So this card polls for
 * itself, on the room's own cadence — staff resetting a timer or
 * starting a new one shows up here within seconds with no refresh,
 * and somebody who joined an early board and stayed all day sees the
 * clock POP UP the moment staff start it. Between polls the wire's
 * instants tick on the phone's own clock, so the digits are always
 * right and roll into red extra time at the same second the wall does.
 */
export function RoomTimers({
  initial,
  code,
}: {
  initial: RoomTimerWire[];
  code: string;
}) {
  const [timers, setTimers] = useState(initial);
  const [now, setNow] = useState(() => Date.now());

  /* The poll. Runs whether or not anything is showing — an empty list
     is exactly the state that has to notice a tournament starting. */
  useEffect(() => {
    let current = true;

    const poll = () => {
      if (document.visibilityState !== "visible") return;
      void roomTimersAction(code).then((next) => {
        if (current) setTimers(next);
      });
    };

    const id = setInterval(poll, 12_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      current = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [code]);

  /* The tick, only while there are digits to move. */
  useEffect(() => {
    if (timers.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timers.length]);

  if (timers.length === 0) return null;

  return (
    <Card className="flex flex-col gap-3" aria-label="Tournament clocks">
      {timers.map((wire) => {
        const reading = readRoomTimer(wire, now);

        return (
          <div key={wire.id} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <TimerIcon
                className={`size-4 shrink-0 ${
                  reading.atTime ? "text-danger" : "text-accent"
                }`}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text-primary">
                  {wire.gameName}
                  {wire.round !== null && (
                    <span className="font-normal text-text-muted">
                      {" "}
                      · Round {wire.round}
                    </span>
                  )}
                </p>
                <p
                  /* Server and client render a second apart; a clock is
                     allowed to disagree with itself by one tick. */
                  suppressHydrationWarning
                  className={`truncate text-xs ${
                    reading.atTime ? "font-semibold text-danger" : "text-text-muted"
                  }`}
                >
                  {reading.label}
                </p>
              </div>
            </div>

            <p
              suppressHydrationWarning
              className={`shrink-0 font-mono text-xl font-bold tabular-nums ${
                reading.atTime
                  ? "text-danger motion-safe:animate-pulse"
                  : "text-text-primary"
              }`}
            >
              {reading.clock}
            </p>
          </div>
        );
      })}
    </Card>
  );
}
