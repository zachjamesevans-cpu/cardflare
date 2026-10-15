"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { SPOTLIGHT_DISMISS, SPOTLIGHT_LINE } from "@/lib/onboarding/intro";

/**
 * The one-time highlight on the Feed's +, after a new player's intro.
 *
 * The founder: "highlighting the post a flare button". The intro's
 * "Look around first" lands on /feed?tour=post, and this dims the page
 * around the + with a ring on it and one line saying what it is for.
 * Any click closes it; a click on the ring opens the composer. The app
 * draws the same thing (mobile/src/spotlight.tsx).
 */

/** How far the ring stands off the button. */
const RING_PAD = 6;

interface Ring {
  left: number;
  top: number;
  size: number;
}

export function PostSpotlight() {
  const router = useRouter();
  const [ring, setRing] = useState<Ring | null>(null);

  useEffect(() => {
    const found = document.querySelector<HTMLElement>('[data-spotlight="post-flare"]');
    if (!found) return;
    const box = found.getBoundingClientRect();
    const size = Math.max(box.width, box.height) + RING_PAD * 2;
    /* Measured once the page has drawn, the way the app waits too. */
    const timer = window.setTimeout(
      () =>
        setRing({
          left: box.left + box.width / 2 - size / 2,
          top: box.top + box.height / 2 - size / 2,
          size,
        }),
      300,
    );
    return () => window.clearTimeout(timer);
  }, []);

  if (!ring) return null;

  /* Off the address too, so a refresh does not show it again. */
  const close = () => {
    setRing(null);
    router.replace("/feed", { scroll: false });
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-label={SPOTLIGHT_LINE}>
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="fixed inset-0 cursor-default"
      />

      {/* The dim with a round hole: a circle the ring's size whose shadow
          covers the page. It was four rectangles, which left a square of
          undimmed page around the round ring - the founder: "just make
          it a circle ... it's like clipping over your circle." */}
      <span
        aria-hidden="true"
        className="pointer-events-none fixed rounded-full shadow-[0_0_0_200vmax_rgba(0,0,0,0.75)]"
        style={{ left: ring.left, top: ring.top, width: ring.size, height: ring.size }}
      />

      <button
        type="button"
        aria-label="Post a Flare"
        onClick={() => {
          setRing(null);
          router.push("/flare");
        }}
        className="fixed cursor-pointer rounded-full border-2 border-accent shadow-[0_0_20px_var(--color-accent)]"
        style={{ left: ring.left, top: ring.top, width: ring.size, height: ring.size }}
      />

      <div
        className="fixed flex max-w-xs flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-elevated p-3"
        style={{ left: 16, top: ring.top + ring.size + 12 }}
      >
        <p className="text-[15px] leading-snug font-semibold text-text-primary">
          {SPOTLIGHT_LINE}
        </p>
        <button
          type="button"
          onClick={close}
          className="cursor-pointer self-start text-sm font-bold text-accent"
        >
          {SPOTLIGHT_DISMISS}
        </button>
      </div>
    </div>
  );
}
