"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, MonitorPlay } from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { readRoomTimer } from "@/lib/event-hub/room-timer-wire";
import type { ScreenCardRow } from "@/lib/event-hub/room-timers";

/**
 * One physical television, as a card on the FlareCast overview.
 *
 * The founder's brief, almost verbatim: "I should be able to open
 * FlareCast and immediately understand: these are my physical screens.
 * I tap one screen and manage what is on it." So a card carries the
 * four things a glance wants — the screen's name, whether it is live,
 * what is on it, and the clock — and nothing it does not: no URL, no
 * instructions, no settings. All of that lives one tap away.
 */

export type ScreenStatus = "live" | "ready" | "empty";

const STATUS_LABEL: Record<ScreenStatus, string> = {
  live: "Live",
  ready: "Ready",
  empty: "No tournament",
};

const STATUS_CHIP: Record<ScreenStatus, string> = {
  live: "bg-accent text-accent-contrast",
  ready: "bg-elevated text-text-secondary",
  empty: "bg-elevated text-text-muted",
};

export function ScreenCard({
  name,
  rows,
  manageHref,
}: {
  name: string;
  rows: ScreenCardRow[];
  manageHref: string;
}) {
  const anyClock = rows.some((row) => row.wire !== null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!anyClock) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyClock]);

  const status: ScreenStatus = rows.some(
    (row) => row.wire && readRoomTimer(row.wire, now).label !== "Paused",
  )
    ? "live"
    : rows.length > 0
      ? "ready"
      : "empty";

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 font-bold tracking-wide text-text-primary uppercase">
          <MonitorPlay className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <span className="truncate">{name}</span>
        </p>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide uppercase ${STATUS_CHIP[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">
          Nothing on this screen yet. Manage it to add a tournament.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => {
            const reading = row.wire ? readRoomTimer(row.wire, now) : null;

            return (
              <div key={row.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-text-primary">
                    <span className="truncate">{row.gameName}</span>
                    {/* The founder's indicator, small and obvious. */}
                    {row.autoMode && (
                      <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-accent uppercase">
                        Auto
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-text-muted">{row.eventName}</p>
                </div>
                <p
                  suppressHydrationWarning
                  className={`shrink-0 font-mono text-lg font-bold tabular-nums ${
                    reading?.atTime
                      ? "text-danger motion-safe:animate-pulse"
                      : reading
                        ? "text-text-primary"
                        : "text-text-muted"
                  }`}
                >
                  {reading ? reading.clock : "Ready"}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Clear counts, not slot fractions: "2 tournaments", never
          "2 of 4 tournaments" — the cap belongs on the manage page. */}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p className="text-xs text-text-muted">
          {rows.length === 0
            ? "No tournaments"
            : `${rows.length} ${rows.length === 1 ? "tournament" : "tournaments"}`}
        </p>
        <Link href={manageHref} className={buttonStyles("secondary", "sm")}>
          Manage
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}
