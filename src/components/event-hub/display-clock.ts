"use client";

import { useEffect, useRef, useState } from "react";

import type { DisplayPayload } from "@/lib/event-hub/display-payload";

/**
 * The display's own sense of time, and its connection to the server.
 *
 * Two problems solved in one place.
 *
 * THE CLOCK. Every timer on this screen is arithmetic against a clock,
 * and the device doing the arithmetic is a browser on a shelf in a shop
 * whose clock may be minutes out. So each poll carries the server's
 * `serverNow`, the difference is measured once, and everything on the
 * wall reads through `now()`. A television with a wrong clock still
 * shows the right round.
 *
 * THE CONNECTION. There is no websocket here, deliberately — see
 * ARCHITECTURE.md and the route this polls. Because no countdown is
 * transmitted, the poll interval only decides how fast a PAUSE reaches
 * the wall. A display that loses wifi keeps counting down correctly and
 * catches up on its first successful poll, which is exactly what a shop
 * needs from a screen that has to survive an evening.
 */

/** How often the display asks for control changes. Not the clock's rate. */
const POLL_MS = 3_000;

/** How often the wall re-renders. Twice a second keeps seconds crisp. */
const TICK_MS = 500;

export interface DisplayClock {
  payload: DisplayPayload;
  /**
   * Server-corrected epoch milliseconds, advanced by the tick below.
   *
   * A value rather than a `Date.now()` helper on purpose: a render has
   * to be pure, and a component that reads the clock mid-render is one
   * React is entitled to call twice and get two answers from. So the
   * time is state, one interval moves it, and every panel on the screen
   * renders from the same instant.
   */
  now: number;
  /** False once a poll has failed and not yet recovered. */
  connected: boolean;
}

export function useDisplayClock(initial: DisplayPayload, token: string): DisplayClock {
  const [payload, setPayload] = useState(initial);
  const [connected, setConnected] = useState(true);

  /* The server render's own clock is the honest first value, and it is a
     prop rather than a call. */
  const [now, setNow] = useState(initial.serverNow);

  /* Server time minus this device's time, re-measured at every poll. */
  const offset = useRef(0);

  useEffect(() => {
    offset.current = initial.serverNow - Date.now();
  }, [initial.serverNow]);

  useEffect(() => {
    let live = true;
    const controller = new AbortController();

    const poll = async () => {
      /* A hidden tab is a television somebody switched inputs on. It will
         catch up when it comes back, and asking meanwhile is waste. */
      if (document.visibilityState !== "visible") return;

      try {
        const response = await fetch(`/api/display/${token}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(String(response.status));

        const fresh = (await response.json()) as DisplayPayload;
        if (!live) return;

        offset.current = fresh.serverNow - Date.now();
        setPayload(fresh);
        setConnected(true);
      } catch {
        /* Swallowed on purpose. The wall keeps its last known state and
           keeps counting — a shop's wifi dropping for ten seconds is not
           something players should ever see. */
        if (live) setConnected(false);
      }
    };

    const pollTimer = setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      live = false;
      controller.abort();
      clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token]);

  useEffect(() => {
    /* One interval for the whole screen. Every panel reads the same
       instant, so eight hours of this is one timer, not one per panel. */
    const advance = () => setNow(Date.now() + offset.current);

    advance();
    const tick = setInterval(advance, TICK_MS);
    return () => clearInterval(tick);
  }, []);

  return { payload, now, connected };
}
