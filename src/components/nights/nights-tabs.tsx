"use client";

import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { NIGHT_TABS } from "@/lib/events/night-copy";
import { DEFAULT_NIGHT_TAB, NIGHT_TAB_ORDER, type NightTab } from "./night-list";

/**
 * Going | Nearby | Past: the strip under the Nights heading.
 *
 * The founder (2026-10-03): "FILTER/TABS: Going | Nearby | Past.
 * Default to Going." A segmented strip, the three lists rendered on
 * the server and handed in as panes, and only the chosen one drawn:
 * nothing navigates and nothing loads. The tab rides in the address
 * as `?tab=nearby` through history.replaceState, the way the profile
 * strip does, so a reload or a shared link lands on the same list and
 * the default leaves the address clean. The app's nights.tsx draws the
 * same three in the same order with the same words.
 */
export function NightsTabs({
  initial,
  panes,
}: {
  /** The tab the page opens on: from the address, Going by default. */
  initial: NightTab;
  /** The three lists, server-rendered, one per tab. */
  panes: Record<NightTab, ReactNode>;
}) {
  const [active, setActive] = useState<NightTab>(initial);
  const baseId = useId();
  const index = NIGHT_TAB_ORDER.indexOf(active);

  useEffect(() => {
    const url = new URL(window.location.href);
    const current = url.searchParams.get("tab");
    const next = active === DEFAULT_NIGHT_TAB ? null : active;
    if (current === next) return;
    if (next) url.searchParams.set("tab", next);
    else url.searchParams.delete("tab");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [active]);

  /* Left and right arrows walk the strip, as a tablist expects. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowLeft" ? -1 : 1;
    const next =
      NIGHT_TAB_ORDER[(index + step + NIGHT_TAB_ORDER.length) % NIGHT_TAB_ORDER.length];
    setActive(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="Nights"
        onKeyDown={onKeyDown}
        className="flex w-full rounded-full border border-border bg-surface p-0.5"
      >
        {NIGHT_TAB_ORDER.map((tab) => {
          const on = tab === active;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab}`}
              aria-selected={on}
              aria-controls={`${baseId}-pane-${tab}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(tab)}
              className={cn(
                "h-8 flex-1 cursor-pointer rounded-full text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
                on
                  ? "bg-elevated text-text-primary"
                  : "text-text-muted hover:text-text-secondary",
              )}
            >
              {NIGHT_TABS[tab]}
            </button>
          );
        })}
      </div>

      {NIGHT_TAB_ORDER.map((tab) => (
        <div
          key={tab}
          role="tabpanel"
          id={`${baseId}-pane-${tab}`}
          aria-labelledby={`${baseId}-tab-${tab}`}
          hidden={tab !== active}
        >
          {panes[tab]}
        </div>
      ))}
    </div>
  );
}
