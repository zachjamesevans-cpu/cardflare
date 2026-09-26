"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import {
  DEMO_PING,
  DEMO_READY,
  demoMessage,
  demoSrcQuery,
  type DemoConfig,
} from "@/lib/event-hub/demo";

/**
 * A television and a phone, drawn around the real product.
 *
 * The television holds an iframe of /display/demo: the display sizes
 * itself in viewport units because it is built for a wall, and an
 * iframe is a viewport of its own, so the screen lays itself out at
 * 1920 by 1080, a real television, and is scaled to whatever width the page gives the frame.
 * The phone holds the control panel directly, which is ordinary
 * phone-first markup and needs no viewport of its own.
 */

const SCREEN_WIDTH = 1920;
const SCREEN_HEIGHT = 1080;

export function TvFrame({
  scene = "focus",
  config,
  label,
  caption,
}: {
  scene?: "focus" | "intermission";
  /**
   * A night to show, for a frame with switches beside it. The first one
   * becomes the frame's address; every change after that is posted into
   * the running screen, so a switch never reloads the television.
   */
  config?: DemoConfig;
  /** The iframe's title: what is on screen, for a screen reader. */
  label: string;
  /** Under the frame. Defaults to the label. */
  caption?: string;
}) {
  const shell = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.5);
  const [src] = useState(() =>
    config ? `/display/demo?${demoSrcQuery(config)}` : `/display/demo?scene=${scene}`,
  );
  /* What the screen was last told, so the first load is not re-sent and
     a night that has not changed is not rebuilt. `loaded` is the
     screen's own word that it is listening. */
  const sent = useRef(config ? demoSrcQuery(config) : null);
  const loaded = useRef(false);
  const latest = useRef(config);

  const post = useCallback(() => {
    const current = latest.current;
    const target = frame.current?.contentWindow;
    if (!current || !target || !loaded.current) return;
    const key = demoSrcQuery(current);
    if (key === sent.current) return;
    sent.current = key;
    target.postMessage(demoMessage(current), window.location.origin);
  }, []);

  useEffect(() => {
    latest.current = config;
    post();
  }, [config, post]);

  useEffect(() => {
    /* The screen says when it is listening; until then a switch is only
       remembered. Only our own frame, on our own origin, is heard. */
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frame.current?.contentWindow) return;
      const data = event.data as { type?: unknown } | null;
      if (data?.type !== DEMO_READY) return;
      loaded.current = true;
      post();
    };
    window.addEventListener("message", onMessage);
    /* The screen may have said READY before this page was listening. */
    frame.current?.contentWindow?.postMessage(
      { type: DEMO_PING },
      window.location.origin,
    );
    return () => window.removeEventListener("message", onMessage);
  }, [post]);

  useEffect(() => {
    const node = shell.current;
    if (!node) return;

    const fit = () => setScale(node.clientWidth / SCREEN_WIDTH);
    fit();

    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <figure className="flex flex-col gap-3">
      <div className="rounded-[18px] border border-border-strong bg-elevated p-2 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] sm:p-3">
        <div
          ref={shell}
          className="relative w-full overflow-hidden rounded-[10px] bg-canvas"
          style={{ height: SCREEN_HEIGHT * scale }}
        >
          <iframe
            ref={frame}
            src={src}
            title={label}
            loading="lazy"
            tabIndex={-1}
            className="absolute top-0 left-0 border-0"
            style={{
              width: SCREEN_WIDTH,
              height: SCREEN_HEIGHT,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>
      <figcaption className="text-center text-sm text-text-muted">
        {caption ?? label}
      </figcaption>
    </figure>
  );
}

export function PhoneFrame({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <figure className="flex flex-col items-center gap-3">
      <div className="w-full max-w-[380px] rounded-[36px] border border-border-strong bg-elevated p-2 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]">
        <div className="relative max-h-[720px] overflow-hidden rounded-[28px] bg-canvas p-3">
          <div
            className="mx-auto mb-3 h-1.5 w-24 rounded-full bg-border"
            aria-hidden="true"
          />
          {children}
          {/* The panel keeps going below the fold, as it does on a phone;
              the fade says so rather than a hard cut through a button. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-canvas"
          />
        </div>
      </div>
      <figcaption className="text-center text-sm text-text-muted">{label}</figcaption>
    </figure>
  );
}
