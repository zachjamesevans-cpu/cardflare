"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * Finished walk-in sessions, folded away.
 *
 * A store's counter opens a walk-in room every time somebody scans on a
 * quiet afternoon, so after a month the Events tab was a scroll of
 * "Walk-in trading · Closed" with the real nights lost among them. The
 * sessions are still the store's history, so they are one tap away
 * rather than gone. The list itself is rendered by the page; this only
 * decides whether it is shown.
 */
export function EventHistoryToggle({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const Icon = open ? ChevronUp : ChevronDown;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="event-history"
        className="flex items-center gap-1.5 self-start text-sm font-semibold text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
      >
        <Icon className="size-4" aria-hidden="true" />
        {open ? "Hide history" : `Show history (${count})`}
      </button>
      {open && <div id="event-history">{children}</div>}
    </div>
  );
}
