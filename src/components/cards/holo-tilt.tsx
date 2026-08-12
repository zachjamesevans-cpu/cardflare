"use client";

import { useEffect, useRef } from "react";

/**
 * The full-size showcase card, catching the light as you turn the phone.
 *
 * The founder's ask: open a showcase and it should behave like a real
 * card held in front of you — tilt the handset, the rainbow slides
 * across. The board's tile has a slow drift of its own; this takes over
 * when the card is big enough to be worth tilting.
 *
 * Three sources, in order of what the device actually has:
 *
 * 1. `deviceorientation`. On iOS 13+ the event is permission-gated and
 *    the request must come from a user gesture — opening the dialog is
 *    one, so it is asked for there and never on page load. A refusal is
 *    not an error: the card simply keeps its resting sheen.
 * 2. Pointer movement over the card, which is what a desktop has.
 * 3. Neither, and the gradient sits still. Reduced-motion callers get
 *    this on purpose.
 *
 * Values are written as CSS custom properties on the element rather
 * than through React state. A tilt fires dozens of times a second and
 * re-rendering on each one would be pure waste; this way the paint
 * stays on the compositor.
 */

/** Beyond this many degrees the sheen is at the edge of its travel. */
const RANGE_DEGREES = 45;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function HoloTilt({ active }: { active: boolean }) {
  const layer = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!active) return;

    const element = layer.current;
    if (!element) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    /** Both axes arrive as -1..1 and leave as a position and an angle. */
    function paint(x: number, y: number) {
      const element = layer.current;
      if (!element) return;

      element.style.setProperty("--holo-x", `${50 + x * 50}%`);
      element.style.setProperty("--holo-y", `${50 + y * 50}%`);
      // The band itself rotates a little, so the light does not merely
      // slide but turns, the way a foil pattern does.
      element.style.setProperty("--holo-angle", `${110 + x * 35}deg`);
    }

    function onOrientation(event: DeviceOrientationEvent) {
      // gamma is the left-right tilt, beta the front-back one.
      const gamma = event.gamma ?? 0;
      const beta = event.beta ?? 0;

      paint(
        clamp(gamma / RANGE_DEGREES, -1, 1),
        clamp((beta - 45) / RANGE_DEGREES, -1, 1),
      );
    }

    function onPointer(event: PointerEvent) {
      const element = layer.current;
      if (!element) return;

      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;

      paint(
        clamp(((event.clientX - box.left) / box.width) * 2 - 1, -1, 1),
        clamp(((event.clientY - box.top) / box.height) * 2 - 1, -1, 1),
      );
    }

    window.addEventListener("pointermove", onPointer);

    /*
     * iOS hides the sensor behind a permission prompt, and the call has
     * to happen inside a user gesture. `active` flips on the tap that
     * opened the dialog, which is still within that gesture's window.
     */
    const orientation = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<"granted" | "denied">;
        })
      | undefined;

    let listening = false;

    function listen() {
      window.addEventListener("deviceorientation", onOrientation);
      listening = true;
    }

    if (typeof orientation?.requestPermission === "function") {
      void orientation
        .requestPermission()
        .then((result) => {
          if (result === "granted") listen();
        })
        // Refused, or asked outside a gesture. The resting sheen stands.
        .catch(() => {});
    } else if (typeof window.DeviceOrientationEvent !== "undefined") {
      listen();
    }

    return () => {
      window.removeEventListener("pointermove", onPointer);
      if (listening) window.removeEventListener("deviceorientation", onOrientation);
    };
  }, [active]);

  return <span ref={layer} aria-hidden="true" className="holo-tilt-layer" />;
}
