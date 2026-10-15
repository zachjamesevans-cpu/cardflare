"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  TOUR_DONE,
  TOUR_IDS,
  TOUR_NEXT,
  TOUR_SKIP,
  TOURS,
  tourCount,
  type TourId,
} from "@/lib/onboarding/intro";

/**
 * The first-visit tours on the website: the app's stops (mobile/src/
 * tour.tsx) over elements marked data-tour="<tour>:<stop>" - the
 * Profile, a store room, your own binder, Nearby. Each is due once
 * after the intro (it leaves a note in this browser per tour), and all
 * again from Settings -> Help -> Replay tips (/profile?tour=all). The
 * founder: "i think we need another similar vibe, but when people click
 * the profile for the first time", then "build 1-3 go".
 */

const noteKey = (id: TourId) => `cf-tour-${id}`;

/** Called by the intro's last buttons, and the replay: every tour due. */
export function noteTours(): void {
  for (const id of TOUR_IDS) {
    try {
      window.localStorage.setItem(noteKey(id), "1");
    } catch {
      /* A nicety: without storage the screens just open plain. */
    }
  }
}

const PAD = 6;
const EDGE = 4;
/** The round ones are icons; the others are rows and panels. */
const ROUND: ReadonlySet<string> = new Set([
  "profile:share",
  "profile:wand",
  "binder:share",
  "binder:settings",
]);

interface Hole {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

function holeFor(key: string): Hole | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${key}"]`);
  if (!el) return null;
  const box = el.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return null;
  if (ROUND.has(key)) {
    const size = Math.max(box.width, box.height) + PAD * 2;
    return {
      x: box.left + box.width / 2 - size / 2,
      y: box.top + box.height / 2 - size / 2,
      width: size,
      height: size,
      radius: size / 2,
    };
  }
  /* A row runs edge to edge; the ring stays inside the window so all
     four of its sides show (the app's rule). */
  const left = Math.max(EDGE, box.left - PAD);
  const right = Math.min(window.innerWidth - EDGE, box.right + PAD);
  return {
    x: left,
    y: box.top - PAD,
    width: right - left,
    height: box.height + PAD * 2,
    radius: 16,
  };
}

/**
 * Drawn by a page. Waits for its tour to be due, then walks the stops.
 * `when` false holds it back for a later visit (a binder that already
 * has cards). `?tour=all` (Replay tips) marks every tour due first.
 */
export function Tour({ id, when = true }: { id: TourId; when?: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const stops = TOURS[id];
  const [at, setAt] = useState<number | null>(null);
  const [hole, setHole] = useState<Hole | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tour") === "all") noteTours();
    if (!when) return;
    let due = false;
    try {
      if (window.localStorage.getItem(noteKey(id)) === "1") {
        window.localStorage.removeItem(noteKey(id));
        due = true;
      }
    } catch {
      /* No storage: nothing is due. */
    }
    if (!due) return;
    const timer = window.setTimeout(() => setAt(0), 600);
    return () => window.clearTimeout(timer);
  }, [id, when]);

  const close = useCallback(() => {
    setAt(null);
    setHole(null);
    if (window.location.search.includes("tour=")) {
      router.replace(path, { scroll: false });
    }
  }, [router, path]);

  const next = useCallback(() => {
    setHole(null);
    setAt((current) =>
      current === null || current >= stops.length - 1 ? null : current + 1,
    );
  }, [stops.length]);

  useEffect(() => {
    if (at === null) {
      return;
    }
    const key = `${id}:${stops[at].key}`;
    /* Into view first, then measured where it settled; a stop with
       nothing on the page is passed over. */
    document
      .querySelector<HTMLElement>(`[data-tour="${key}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
    const timer = window.setTimeout(() => {
      const found = holeFor(key);
      if (found) setHole(found);
      else next();
    }, 450);
    return () => window.clearTimeout(timer);
  }, [at, next, id, stops]);

  useEffect(() => {
    if (at === null && hole === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [at, hole, close]);

  if (at === null || !hole) return null;

  const stop = stops[at];
  const last = at === stops.length - 1;
  const below = hole.y + hole.height + 180 < window.innerHeight;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-label={stop.line}>
      <button
        type="button"
        aria-label={TOUR_NEXT}
        onClick={last ? close : next}
        className="fixed inset-0 cursor-default"
      />
      {/* The dim with the hole: a shape the stop's size whose shadow
          covers the page, ringed in the accent. */}
      <span
        aria-hidden="true"
        className="pointer-events-none fixed border-2 border-accent shadow-[0_0_0_200vmax_rgba(0,0,0,0.75),0_0_14px_var(--color-accent)]"
        style={{
          left: hole.x,
          top: hole.y,
          width: hole.width,
          height: hole.height,
          borderRadius: hole.radius,
        }}
      />
      <div
        className="fixed right-4 left-4 mx-auto flex max-w-md flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-elevated p-4"
        style={
          below
            ? { top: hole.y + hole.height + 12 }
            : { bottom: window.innerHeight - hole.y + 12 }
        }
      >
        <p className="text-[15px] leading-snug font-semibold text-text-primary">
          {stop.line}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-text-muted">
            {tourCount(at, stops.length)}
          </span>
          <div className="flex items-center gap-4">
            {!last && (
              <button
                type="button"
                onClick={close}
                className="cursor-pointer text-sm font-semibold text-text-secondary hover:text-text-primary"
              >
                {TOUR_SKIP}
              </button>
            )}
            <button
              type="button"
              onClick={last ? close : next}
              className="cursor-pointer rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-contrast"
            >
              {last ? TOUR_DONE : TOUR_NEXT}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
