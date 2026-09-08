"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Flag,
  Hand,
  MonitorPlay,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Timer as TimerIcon,
  Tv,
  type LucideIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { timerControlAction } from "@/lib/event-hub/actions";
import { readRoomTimer, type RoomTimerReading } from "@/lib/event-hub/room-timer-wire";
import type { ScreenCardRow } from "@/lib/event-hub/room-timers";

/**
 * One physical television, as a card on the FlareCast overview.
 *
 * The founder's brief, almost verbatim: "I should be able to open
 * FlareCast and immediately understand: these are my physical screens.
 * I tap one screen and manage what is on it." And a round later, once
 * several tournaments were running at once: the overview "needs to
 * have more controls shown, and should have the color code of
 * whichever tournament is on that screen too... if they're doing
 * multiple tournaments it's just a more informative view", with Open
 * TV display "higher on the screen, and clickable on the main
 * FlareCast screen where all screens are visible".
 *
 * So a card opens with the two buttons a night actually uses, and each
 * tournament on it is a colour-coded row carrying the round, the
 * bracket, where the clock stands and the two or three controls that
 * state wants. Everything rarer (overtime turns, reordering, settings)
 * still lives on the manage page.
 */

interface RowControl {
  op: string;
  label: string;
  icon: LucideIcon;
  primary?: boolean;
}

/**
 * The controls this tournament's state wants right now, in the order
 * a thumb reaches for them. Every op goes through the same guarded
 * server action the manage page uses, so a double tap or a second
 * phone is harmless.
 */
function rowControls(
  row: ScreenCardRow,
  reading: RoomTimerReading | null,
  now: number,
) {
  const wire = row.wire;
  const nextRound = Math.min(99, (row.round ?? 1) + 1);

  if (!wire) {
    if (row.status === "complete") {
      return [{ op: "reset", label: "Run again", icon: RotateCcw }];
    }
    return [{ op: "start", label: "Start", icon: Play, primary: true }];
  }

  /* Auto Mode between rounds. The founder's three escapes, the same
     as the manage page: hold, two minutes, start now. A countdown the
     page built as "counting" may have reached zero since, in which
     case it is waiting on a person. */
  const nextAt = wire.nextRoundAt ? Date.parse(wire.nextRoundAt) : NaN;
  const counting = Number.isFinite(nextAt) && nextAt > now;
  const auto: typeof row.intermission =
    row.intermission === "counting" && !counting ? "waiting" : row.intermission;

  if (auto === "counting") {
    return [
      { op: "auto-hold", label: "Hold", icon: Hand },
      { op: "auto-extend", label: "+2 min", icon: Plus },
      { op: "auto-start-now", label: `Start round ${nextRound}`, icon: Play },
    ];
  }
  if (auto === "held") {
    return [
      { op: "auto-resume", label: "Resume", icon: Play, primary: true },
      { op: "auto-extend", label: "+2 min", icon: Plus },
      { op: "auto-start-now", label: `Start round ${nextRound}`, icon: Play },
    ];
  }
  if (auto === "waiting" || auto === "blocked" || auto === "due") {
    return [
      {
        op: "auto-start-now",
        label: `Start round ${nextRound}`,
        icon: Play,
        primary: true,
      },
      { op: "auto-extend", label: "+2 min", icon: Plus },
    ];
  }

  if (reading?.label === "Paused") {
    return [
      { op: "start", label: "Resume", icon: Play, primary: true },
      { op: "add-minute", label: "+1 min", icon: Plus },
      { op: "call-time", label: "Call time", icon: Flag },
    ];
  }

  if (reading?.atTime) {
    const controls: RowControl[] = [
      {
        op: "next-round",
        label: `Start round ${nextRound}`,
        icon: Play,
        primary: true,
      },
    ];
    /* Time called with no clock running yet: extra time is one press
       away, exactly as on the manage page. */
    if (wire.phase === "time_called") {
      controls.push({ op: "start-overtime", label: "Start overtime", icon: TimerIcon });
    }
    return controls;
  }

  return [
    { op: "pause", label: "Pause", icon: Pause },
    { op: "add-minute", label: "+1 min", icon: Plus },
    { op: "call-time", label: "Call time", icon: Flag },
  ];
}

/** The line under the event name: "Round 4 · Swiss · Bo3". */
function rowDetail(row: ScreenCardRow) {
  const parts = [
    row.round !== null ? `Round ${row.round}` : "No round set",
    row.bracket === "elimination" ? "Elimination" : "Swiss",
  ];
  if (row.format) parts.push(row.format);
  return parts.join(" · ");
}

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
  displayHref,
  addHref,
}: {
  name: string;
  rows: ScreenCardRow[];
  manageHref: string;
  /** The television's own page, opened in a new tab. */
  displayHref: string;
  /** Where to add a tournament; null once the screen is full. */
  addHref: string | null;
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

      {/* The two buttons a night uses, at the top where a thumb lands.
          The television opens in its own tab so this page stays put. */}
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={displayHref}
          target="_blank"
          rel="noreferrer noopener"
          className={buttonStyles("primary", "sm")}
        >
          <Tv className="size-4" aria-hidden="true" />
          Open TV display
        </a>
        <Link href={manageHref} className={buttonStyles("secondary", "sm")}>
          Manage
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">
          Nothing on this screen yet. Add a tournament and the television lights up.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => {
            const reading = row.wire ? readRoomTimer(row.wire, now) : null;
            const controls = rowControls(row, reading, now);
            const done = !row.wire && row.status === "complete";

            return (
              <div
                key={row.id}
                style={{ ["--game" as string]: `var(${row.accentToken})` }}
                className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-l-4 border-border border-l-[var(--game)] bg-elevated p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-center gap-2 text-xs font-semibold tracking-[0.16em] text-[var(--game)] uppercase">
                      <span className="truncate">{row.gameName}</span>
                      {/* The founder's indicator, small and obvious. */}
                      {row.autoMode && (
                        <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-accent">
                          AUTO
                        </span>
                      )}
                    </p>
                    {row.eventName && (
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {row.eventName}
                      </p>
                    )}
                    <p className="truncate text-xs text-text-muted">{rowDetail(row)}</p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p
                      suppressHydrationWarning
                      className={`font-mono text-2xl font-bold tabular-nums ${
                        reading?.atTime
                          ? "text-danger motion-safe:animate-pulse"
                          : reading
                            ? "text-text-primary"
                            : "text-text-muted"
                      }`}
                    >
                      {reading ? reading.clock : done ? "Done" : "Ready"}
                    </p>
                    <p
                      suppressHydrationWarning
                      className={`text-xs font-semibold ${
                        reading?.atTime ? "text-danger" : "text-text-muted"
                      }`}
                    >
                      {reading ? reading.label : done ? "Complete" : "Not started"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {controls.map((control) => (
                    <form key={control.op} action={timerControlAction}>
                      <input type="hidden" name="timerId" value={row.id} />
                      <input type="hidden" name="op" value={control.op} />
                      <SubmitButton
                        label={control.label}
                        pendingLabel="…"
                        variant={control.primary ? "primary" : "secondary"}
                        size="sm"
                        icon={control.icon}
                      />
                    </form>
                  ))}
                </div>
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
        {addHref && (
          <Link
            href={addHref}
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add a tournament
          </Link>
        )}
      </div>
    </Card>
  );
}
