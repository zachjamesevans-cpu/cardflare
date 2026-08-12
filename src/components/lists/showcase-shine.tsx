"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * Wraps a showcased card so it catches the light when touched.
 *
 * The founder's cue: a card somebody will let go looks like foil. The
 * rest of the board is matte, so the shimmer alone carries the meaning
 * with no copy at all — and it plays on tap or click rather than
 * looping, because a rail of permanently animating cards is a
 * distraction, a battery cost, and less like the real thing. You tilt a
 * card, it catches the light, it settles.
 *
 * A tiny client island around server-rendered children: the tile inside
 * (artwork, badges, forms) arrives fully formed, and this only decides
 * whether the sheen is mid-sweep. The wrapper never swallows the tap —
 * the card underneath still zooms, and the buttons still submit.
 */
export function ShowcaseShine({ children }: { children: ReactNode }) {
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function play() {
    if (timer.current) clearTimeout(timer.current);
    setPlaying(true);
    // Matches the keyframe duration; the class has to leave for the
    // animation to be re-triggerable on the next tap.
    timer.current = setTimeout(() => setPlaying(false), 900);
  }

  return (
    <span
      className="holo-sheen contents"
      onPointerDown={play}
      /* Decorative: the meaning is carried by the badge and the label
         in the tile itself, which screen readers already read. */
      aria-hidden={false}
    >
      <span className="relative block rounded-[8px]">
        {children}
        <span
          aria-hidden="true"
          className={playing ? "holo-sheen-layer holo-playing" : "holo-sheen-layer"}
        />
      </span>
    </span>
  );
}
