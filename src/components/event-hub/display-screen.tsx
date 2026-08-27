"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, Minimize, WifiOff } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import type { DisplayPayload } from "@/lib/event-hub/display-payload";
import { displayPlan } from "@/lib/event-hub/layout";
import { rotationWindow } from "@/lib/event-hub/rotation";
import { remainingMs, timerPhase, type HubTimer } from "@/lib/event-hub/timer";
import { FeaturedFlare } from "./featured-flare";
import { FlareBoard } from "./flare-board";
import { TimerPanel } from "./timer-panel";
import { useDisplayClock } from "./display-clock";

/**
 * The screen a shop leaves on all night.
 *
 * Everything about this component is shaped by that sentence. It holds
 * exactly three intervals for the whole page — a poll, a frame, a
 * rotation — rather than one per panel, so eight hours does not
 * accumulate timers. It never mounts an animation that loops. It keeps
 * showing the last state it knew when the wifi goes, because a shop's
 * players should never find out that the wifi went.
 *
 * Application chrome is deliberately absent. The fullscreen control
 * appears when somebody moves a mouse and leaves again, and there is
 * nothing else to press: this is not a page, it is a screen.
 */

/** Seconds a Flare window holds. Inside the 7-10s the brief asks for. */
const ROTATE_MS = 8_000;

/** How long the fullscreen control lingers after the mouse stops. */
const CHROME_MS = 3_000;

export function DisplayScreen({
  initial,
  token,
  qrSvg,
}: {
  initial: DisplayPayload;
  token: string;
  /**
   * Rendered on the server, once.
   *
   * The store's counter code does not change while a television is on,
   * so re-encoding it in the browser would be work done thousands of
   * times for an image that never differs.
   */
  qrSvg: string | null;
}) {
  const { payload, now: at, connected } = useDisplayClock(initial, token);
  const [tick, setTick] = useState(0);

  const timers = payload.timers;
  const plan = displayPlan(payload.layout, timers.length);
  const visibleFlares = rotationWindow(payload.flares, plan.flareSlots, tick);

  /*
   * FOCUS: one tournament owns the screen, and the Flare board stops
   * being a strip along the bottom — it becomes a full-height column
   * featuring one card at a time. The founder's brief: "ONE tournament
   * per screen should produce the richest/best experience."
   */
  const focus = plan.layout === "single" && timers.length > 0 && payload.showFlares;

  useEffect(() => {
    /* Focus rotates whenever there is more than one thing to feature;
       the strip layouts rotate only once the window is full. */
    const rotates = focus
      ? payload.flares.length > 1
      : payload.showFlares && payload.flares.length > plan.flareSlots;
    if (!rotates) return;

    const rotate = setInterval(() => setTick((value) => value + 1), ROTATE_MS);
    return () => clearInterval(rotate);
  }, [focus, payload.showFlares, payload.flares.length, plan.flareSlots]);

  useChimes(timers, payload.soundEnabled, at);

  if (focus) {
    return (
      <main
        id="main"
        className="flex h-dvh w-full flex-col gap-[clamp(0.4rem,0.9vw,1.25rem)] overflow-hidden bg-canvas p-[clamp(0.6rem,1.2vw,1.75rem)]"
      >
        <Header
          storeName={payload.storeName}
          nightTitle={payload.nightTitle}
          connected={connected}
        />

        <div className="flex min-h-0 flex-1 gap-[clamp(0.5rem,1vw,1.25rem)]">
          {/* The timer keeps the widest column — hierarchy rule #1 —
              and the Featured Flare column is tall enough that a
              portrait card finally gets to be BIG. Grid, because a grid
              item stretches to the full track by default where a flex
              child would sit at its content height. */}
          <div className="grid min-h-0 flex-[5] [&>*]:min-h-0">
            <TimerPanel timer={timers[0]} layout="single" now={at} />
          </div>

          <div className="flex min-h-0 flex-[3] flex-col gap-[clamp(0.5rem,1vw,1.25rem)]">
            <div className="min-h-0 flex-1">
              <FeaturedFlare flares={payload.flares} tick={tick} />
            </div>
            {payload.showQr && qrSvg && payload.joinCode && (
              <div className="flex shrink-0 justify-center">
                <JoinPanel code={payload.joinCode} qrSvg={qrSvg} />
              </div>
            )}
          </div>
        </div>

        {payload.announcement && (
          <p className="shrink-0 truncate rounded-[var(--radius-card)] border border-accent/30 bg-accent/10 px-[clamp(0.6rem,1.2vw,1.5rem)] py-[clamp(0.35rem,0.7vw,0.9rem)] text-[clamp(0.9rem,1.7vw,1.9rem)] font-semibold text-accent">
            {payload.announcement}
          </p>
        )}

        <FullscreenControl />
      </main>
    );
  }

  return (
    <main
      id="main"
      className="flex h-dvh w-full flex-col gap-[clamp(0.4rem,0.9vw,1.25rem)] overflow-hidden bg-canvas p-[clamp(0.6rem,1.2vw,1.75rem)]"
    >
      <Header
        storeName={payload.storeName}
        nightTitle={payload.nightTitle}
        connected={connected}
      />

      {timers.length === 0 ? (
        <NoTimers />
      ) : (
        <div
          /* `min-h-0` on the grid AND `[&>*]:min-h-0` on its cells: a grid
             item defaults to min-height:auto, so without both the panels
             refuse to shrink and push the board off the bottom. */
          className={`grid min-h-0 flex-1 gap-[clamp(0.5rem,1vw,1.25rem)] [&>*]:min-h-0 ${
            plan.columns === 1
              ? "grid-cols-1"
              : plan.columns === 3
                ? "grid-cols-3"
                : "grid-cols-2"
          }`}
        >
          {timers.map((timer) => (
            <TimerPanel key={timer.id} timer={timer} layout={plan.layout} now={at} />
          ))}
        </div>
      )}

      {payload.announcement && (
        <p className="shrink-0 truncate rounded-[var(--radius-card)] border border-accent/30 bg-accent/10 px-[clamp(0.6rem,1.2vw,1.5rem)] py-[clamp(0.35rem,0.7vw,0.9rem)] text-[clamp(0.9rem,1.7vw,1.9rem)] font-semibold text-accent">
          {payload.announcement}
        </p>
      )}

      {(payload.showFlares || payload.showQr) && (
        <div
          className={`flex min-h-0 shrink-0 gap-[clamp(0.5rem,1vw,1.25rem)] overflow-hidden ${
            plan.flareShape === "board"
              ? /* Was 30%, and the timer panel above it was mostly empty
                   air: a clock and a game name in half a television. The
                   card is the thing people walk over to look at, so the
                   board takes eight points back. The clock is still
                   enormous. */
                "h-[38%]"
              : plan.flareShape === "carousel"
                ? "h-[30%]"
                : "h-[22%]"
          }`}
        >
          {payload.showFlares && (
            <div className="min-w-0 flex-1">
              <FlareBoard flares={visibleFlares} shape={plan.flareShape} tick={tick} />
            </div>
          )}

          {payload.showQr && qrSvg && payload.joinCode && (
            <JoinPanel code={payload.joinCode} qrSvg={qrSvg} />
          )}
        </div>
      )}

      <FullscreenControl />
    </main>
  );
}

function Header({
  storeName,
  nightTitle,
  connected,
}: {
  storeName: string;
  nightTitle: string | null;
  connected: boolean;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4">
      <div className="flex min-w-0 items-baseline gap-[clamp(0.5rem,1.2vw,1.25rem)]">
        <h1 className="truncate text-[clamp(1rem,2.1vw,2.4rem)] font-bold tracking-tight text-text-primary uppercase">
          {storeName}
        </h1>
        {/* Not when it is the store's own name again. A header reading
            "MOX VALLEY GAMES · MOX VALLEY GAMES" is the same word twice. */}
        {nightTitle &&
          nightTitle.trim().toLowerCase() !== storeName.trim().toLowerCase() && (
            <p className="truncate text-[clamp(0.75rem,1.5vw,1.7rem)] font-semibold tracking-[0.2em] text-accent uppercase">
              {nightTitle}
            </p>
          )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {/* Said quietly, and only to staff who look for it. A player does
            not need to know the wall is a few seconds stale — the clock
            in front of them is still right. */}
        {!connected && (
          <span
            className="flex items-center gap-1.5 text-[clamp(0.6rem,0.85vw,0.9rem)] text-text-muted"
            title="Reconnecting. The timers keep running."
          >
            <WifiOff className="size-4" aria-hidden="true" />
            Reconnecting
          </span>
        )}
        {/* cardflare stays present without competing with the shop. */}
        <Logo size={28} />
      </div>
    </header>
  );
}

function JoinPanel({ code, qrSvg }: { code: string; qrSvg: string }) {
  return (
    <aside className="flex shrink-0 flex-col items-center justify-center gap-[clamp(0.2rem,0.5vw,0.6rem)] rounded-[var(--radius-card)] border border-border bg-surface p-[clamp(0.4rem,0.8vw,1rem)]">
      <p className="text-[clamp(0.6rem,0.85vw,1rem)] font-semibold tracking-[0.18em] text-accent uppercase">
        Scan to join
      </p>
      <div
        /* White plate behind the code: a QR on a dark panel is a QR that
           does not scan from four metres away. */
        className="rounded-[8px] bg-white p-[clamp(0.2rem,0.4vw,0.5rem)] [&>svg]:block [&>svg]:size-[clamp(4rem,9vh,9rem)]"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: qrSvg }}
      />
      <p className="font-mono text-[clamp(0.8rem,1.4vw,1.6rem)] font-bold tracking-[0.15em] text-text-primary">
        {code}
      </p>
    </aside>
  );
}

function NoTimers() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-[var(--radius-panel)] border border-dashed border-border">
      <p className="text-[clamp(1.2rem,3vw,3rem)] font-bold text-text-secondary">
        No tournaments running
      </p>
      <p className="text-[clamp(0.85rem,1.4vw,1.4rem)] text-text-muted">
        Add one from the store console and it appears here.
      </p>
    </div>
  );
}

/**
 * Fullscreen, and keeping the screen awake.
 *
 * Both are best-effort by design. The Fullscreen API needs a gesture and
 * some browsers refuse it outright; the Wake Lock API does not exist on
 * several of the devices a shop will plug into a television. Neither
 * failing costs the display anything, so neither is allowed to throw.
 */
function FullscreenControl() {
  const [full, setFull] = useState(false);
  const [visible, setVisible] = useState(true);
  const lock = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    const onChange = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  /* The control hides itself, so what is left on the wall is the event. */
  useEffect(() => {
    let hide: ReturnType<typeof setTimeout>;

    const wake = () => {
      setVisible(true);
      clearTimeout(hide);
      hide = setTimeout(() => setVisible(false), CHROME_MS);
    };

    wake();
    window.addEventListener("mousemove", wake);
    window.addEventListener("touchstart", wake);

    return () => {
      clearTimeout(hide);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("touchstart", wake);
    };
  }, []);

  const requestWakeLock = useCallback(async () => {
    try {
      if (!("wakeLock" in navigator)) return;
      lock.current = await navigator.wakeLock.request("screen");
    } catch {
      /* Denied, unsupported, or the tab was hidden. A television that
         dims is a smaller problem than a screen that threw. */
    }
  }, []);

  /* A lock is dropped whenever the tab hides, so it is re-taken on the
     way back. Without this an eight-hour night ends with a dark TV. */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && lock.current?.released !== false) {
        void requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock.current?.release().catch(() => {});
      lock.current = null;
    };
  }, [requestWakeLock]);

  const toggle = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
        /* Asked for here because this is the gesture: a wake lock
           requested without one is refused by every browser that has it. */
        await requestWakeLock();
      }
    } catch {
      /* Some browsers refuse fullscreen outright — kiosk shells, iOS
         Safari. The display works exactly as well without it. */
    }
  };

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      /* Focusable at all times so a keyboard can reach it; only visible
         to a mouse that just moved. */
      className={`fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full border border-border-strong bg-elevated px-4 py-2.5 text-sm font-semibold text-text-primary transition-opacity duration-[var(--duration-base)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
        visible ? "opacity-90" : "opacity-0"
      }`}
    >
      {full ? (
        <Minimize className="size-4" aria-hidden="true" />
      ) : (
        <Maximize className="size-4" aria-hidden="true" />
      )}
      {full ? "Exit fullscreen" : "Enter fullscreen"}
    </button>
  );
}

/**
 * The optional chimes.
 *
 * Off unless a store turned them on, and silent regardless until
 * somebody has interacted with the page — browsers refuse audio before a
 * gesture, and this feature is not allowed to depend on one. Each
 * threshold fires once per timer per round; resetting a timer clears it.
 */
function useChimes(timers: HubTimer[], enabled: boolean, now: number) {
  const fired = useRef(new Set<string>());
  const context = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const open = () => {
      try {
        context.current ??= new AudioContext();
        void context.current.resume();
      } catch {
        /* No audio on this device. Nothing else changes. */
      }
    };

    window.addEventListener("pointerdown", open, { once: true });
    window.addEventListener("keydown", open, { once: true });

    return () => {
      window.removeEventListener("pointerdown", open);
      window.removeEventListener("keydown", open);
    };
  }, [enabled]);

  useEffect(
    () => () => {
      void context.current?.close().catch(() => {});
      context.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!enabled) return;

    for (const timer of timers) {
      const phase = timerPhase(timer, now);
      const left = remainingMs(timer, now);

      /* A reset puts the timer back to ready, which is where the marks
         for this round are forgotten. */
      if (phase === "ready") {
        for (const mark of ["ten", "five", "one", "time"]) {
          fired.current.delete(`${timer.id}:${mark}`);
        }
        continue;
      }

      const mark =
        phase === "time_called"
          ? "time"
          : left === null || phase !== "running"
            ? null
            : left < 60_000
              ? "one"
              : left < 5 * 60_000
                ? "five"
                : left < 10 * 60_000
                  ? "ten"
                  : null;

      if (!mark) continue;

      const key = `${timer.id}:${mark}`;
      if (fired.current.has(key)) continue;
      fired.current.add(key);

      chime(context.current, mark === "time" ? 2 : 1);
    }
  }, [timers, enabled, now]);
}

/** Two short sine blips. Deliberately not a klaxon. */
function chime(context: AudioContext | null, count: number) {
  if (!context || context.state !== "running") return;

  for (let index = 0; index < count; index += 1) {
    const at = context.currentTime + index * 0.3;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.08, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);

    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    /* Stopped explicitly: an oscillator left running is the classic way
       a page open for eight hours ends up with hundreds of nodes. */
    oscillator.stop(at + 0.25);
  }
}
