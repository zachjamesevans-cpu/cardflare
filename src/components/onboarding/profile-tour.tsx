"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  PROFILE_TOUR,
  TOUR_DONE,
  TOUR_NEXT,
  TOUR_SKIP,
  tourCount,
  type TourStop,
} from "@/lib/onboarding/intro";

/**
 * The profile tour on the website: the app's four stops
 * (mobile/src/profile-tour.tsx), over the elements marked data-tour on
 * /profile. Due once after the intro (it leaves a note in this browser)
 * or from Settings -> Help (/profile?tour=profile). The founder: "i
 * think we need another similar vibe, but when people click the profile
 * for the first time."
 */

/** The intro leaves this; the first /profile visit reads and clears it. */
export const TOUR_NOTE = "cf-tour-profile";

/** Called by the intro's last buttons: the tour is due. */
export function noteProfileTour(): void {
  try {
    window.localStorage.setItem(TOUR_NOTE, "1");
  } catch {
    /* A nicety: without storage the Profile just opens plain. */
  }
}

const PAD = 6;
const EDGE = 4;
const ROUND: ReadonlySet<TourStop["key"]> = new Set(["share", "wand"]);

interface Hole {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

function holeFor(key: TourStop["key"]): Hole | null {
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

export function ProfileTour() {
  const router = useRouter();
  const [at, setAt] = useState<number | null>(null);
  const [hole, setHole] = useState<Hole | null>(null);

  useEffect(() => {
    let due = new URLSearchParams(window.location.search).get("tour") === "profile";
    try {
      if (window.localStorage.getItem(TOUR_NOTE) === "1") {
        window.localStorage.removeItem(TOUR_NOTE);
        due = true;
      }
    } catch {
      /* No storage: the replay link still works. */
    }
    if (!due) return;
    const timer = window.setTimeout(() => setAt(0), 600);
    return () => window.clearTimeout(timer);
  }, []);

  const close = useCallback(() => {
    setAt(null);
    setHole(null);
    if (window.location.search.includes("tour=")) {
      router.replace("/profile", { scroll: false });
    }
  }, [router]);

  const next = useCallback(() => {
    setHole(null);
    setAt((current) =>
      current === null || current >= PROFILE_TOUR.length - 1 ? null : current + 1,
    );
  }, []);

  useEffect(() => {
    if (at === null) {
      return;
    }
    const key = PROFILE_TOUR[at].key;
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
  }, [at, next]);

  useEffect(() => {
    if (at === null && hole === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [at, hole, close]);

  if (at === null || !hole) return null;

  const stop = PROFILE_TOUR[at];
  const last = at === PROFILE_TOUR.length - 1;
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
          <span className="text-sm font-semibold text-text-muted">{tourCount(at)}</span>
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
