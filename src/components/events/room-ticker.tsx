"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps an open room current without anybody pulling to refresh.
 *
 * A timer that re-renders the page from the server every few seconds while
 * the tab is visible. That is the whole component — deliberately, and it is
 * the same decision presence made in Milestone 4: this room runs on polled
 * server state, not on a live connection. A websocket (or Supabase Realtime,
 * which RLS-with-no-policies rules out anyway) would buy a few seconds'
 * latency on a signal whose answer is a walk across a physical room, at the
 * price of connection management on locked phones in a shop with bad wifi.
 *
 * Twelve seconds is the founder-calibrated cadence: at sixty, an offer sat
 * invisible long enough that people reached for pull-to-refresh, which is
 * the failure this component exists to prevent. A room re-render is a
 * handful of indexed reads, and hidden tabs pay nothing at all — a shop's
 * worth of phones at this rate is still trivial load.
 *
 * The interval also doubles as the presence heartbeat: every refresh renders
 * the page, the page touches `last_seen_at` (rate-limited internally), and a
 * phone left open on a table keeps reading as "here" — which it is.
 *
 * Hidden tabs skip ticks rather than queueing them: a phone in a pocket does
 * not need fresh offers, and the refresh on wake happens naturally when the
 * next visible tick fires.
 */
export function RoomTicker({ intervalMs = 12_000 }: { intervalMs?: number }) {
  const router = useRouter();
  /* A refresh still in flight on slow wifi is not joined by another:
     the transition's pending flag is the in-flight marker. */
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  useEffect(() => {
    inFlight.current = pending;
  }, [pending]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible" || inFlight.current) return;
      startTransition(() => router.refresh());
    };

    const timer = setInterval(tick, intervalMs);

    // Coming back to the tab refreshes immediately rather than waiting out
    // the rest of an interval that started while the phone was pocketed.
    const onVisible = () => {
      if (document.visibilityState === "visible" && !inFlight.current) {
        startTransition(() => router.refresh());
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, intervalMs]);

  return null;
}
