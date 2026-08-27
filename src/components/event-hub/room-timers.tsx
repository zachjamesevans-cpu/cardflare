"use client";

import { useEffect, useState } from "react";
import { TimerIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { readRoomTimer, type RoomTimerWire } from "@/lib/event-hub/room-timer-wire";

/**
 * The wall's clocks, in a pocket.
 *
 * The founder: "if you step out or can't see the screen, you can
 * quickly check the timer on your phone." The wire carries instants,
 * so this ticks on the phone's own clock — right between refreshes,
 * and it rolls into extra time by itself, red and pulsing, exactly
 * when the television does.
 */
export function RoomTimers({ timers }: { timers: RoomTimerWire[] }) {
  const [now, setNow] = useState(() => Date.now());

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
                  {reading.atTime
                    ? `${reading.label} · ${wire.headline}`
                    : reading.label}
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
