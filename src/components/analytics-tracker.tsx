"use client";

import { useEffect } from "react";

import { track, type AnalyticsEvent } from "@/lib/analytics";

/**
 * Records the page view and delegates CTA click tracking.
 *
 * Uses one document-level listener keyed off `data-analytics-event` so that
 * server-rendered links stay server components — adding tracking to a CTA is an
 * attribute, not a client boundary.
 */
export function AnalyticsTracker() {
  useEffect(() => {
    track("landing_page_viewed");

    function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const trigger = target?.closest<HTMLElement>("[data-analytics-event]");
      const name = trigger?.dataset.analyticsEvent;

      if (name) track(name as AnalyticsEvent);
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
