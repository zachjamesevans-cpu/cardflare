"use client";

import { useEffect, useState } from "react";

import type { DisplayPayload } from "@/lib/event-hub/display-payload";
import {
  DEMO_PING,
  DEMO_READY,
  demoConfigFromMessage,
  demoPayload,
} from "@/lib/event-hub/demo";
import { DisplayScreen } from "./display-screen";

/**
 * The sample television, taking its night from the page around it.
 *
 * The store page's switches post a message into this frame rather than
 * changing its address, so flipping a scene swaps the night in place
 * instead of reloading the whole screen. Only the embedding page on our
 * own origin is listened to, and the message is parsed by the same
 * checks as the address bar, so a message can only ask for a night a
 * link could have asked for.
 */
export function DemoDisplay({
  initial,
  joinUrl,
  qrSvg,
}: {
  initial: DisplayPayload;
  joinUrl: string;
  qrSvg: string;
}) {
  const [night, setNight] = useState({ payload: initial, version: 0 });

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== window.parent || window.parent === window) return;

      if ((event.data as { type?: unknown } | null)?.type === DEMO_PING) {
        window.parent.postMessage({ type: DEMO_READY }, window.location.origin);
        return;
      }

      const config = demoConfigFromMessage(event.data);
      if (!config) return;

      setNight((current) => ({
        payload: demoPayload(config, Date.now(), joinUrl),
        version: current.version + 1,
      }));
    };

    window.addEventListener("message", onMessage);
    /* Say so once listening. The frame's load event can fire before
       this page has hydrated, and a night posted into that gap would be
       lost; the page waits for this instead. If the page was not yet
       listening either, its PING asks again. */
    if (window.parent !== window) {
      window.parent.postMessage({ type: DEMO_READY }, window.location.origin);
    }
    return () => window.removeEventListener("message", onMessage);
  }, [joinUrl]);

  /* Keyed by version: a new night is a fresh screen with fresh clocks,
     exactly as if the page had loaded on it. */
  return (
    <DisplayScreen
      key={night.version}
      initial={night.payload}
      token={null}
      qrSvg={qrSvg}
    />
  );
}
