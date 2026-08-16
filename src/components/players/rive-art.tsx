"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

/**
 * A Rive cosmetic, playing.
 *
 * The runtime is imported lazily, on mount, for one reason: it carries
 * a 1.8 MB WebAssembly module, and most pages never draw a Rive
 * cosmetic. A profile that wears none pays nothing.
 *
 * The WASM is served from our own origin (public/rive/rive.wasm, copied
 * from the installed package at build time by scripts/copy-rive-wasm.mjs
 * so it can never drift from the runtime's version). The library
 * defaults to fetching it from a CDN, and this product has one hard
 * field fact about CDNs and middleboxes: the founder's network eats
 * things it did not expect. The fallback URL is switched off for the
 * same reason - one origin, ours, or nothing.
 *
 * A file that fails to load leaves an empty box rather than an error:
 * whatever it was decorating - a picture, a card - is still there and
 * still readable, which is the right failure for an ornament.
 */

export interface RiveArtProps {
  /** The public URL of the .riv file. */
  url: string;
  /** Which artboard to play, or null for the file's default. */
  artboard?: string | null;
  /** Which state machine to run, or null for the file's default. */
  stateMachine?: string | null;
  /**
   * How the art fills its box. "cover" for things that back a surface
   * (scenes, backgrounds, card faces), "contain" for things with a
   * shape of their own (a ring around a picture).
   */
  fit?: "cover" | "contain";
  className?: string;
}

export function RiveArt({
  url,
  artboard = null,
  stateMachine = null,
  fit = "contain",
  className,
}: RiveArtProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;

    /* Torn down by the cleanup below if this effect is undone before
       the dynamic import settles - a fast navigation, or React's
       double-invoked effects in development. */
    let live = true;
    let instance: {
      cleanup: () => void;
      resizeDrawingSurfaceToCanvas: () => void;
    } | null = null;

    void (async () => {
      try {
        const rive = await import("@rive-app/canvas");
        if (!live) return;

        /* Our origin, once, before the first instance is built. */
        rive.RuntimeLoader.setWasmUrl("/rive/rive.wasm");
        rive.RuntimeLoader.setWasmFallbackUrl(null);

        const still =
          typeof window !== "undefined" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        const built = new rive.Rive({
          src: url,
          canvas: element,
          artboard: artboard ?? undefined,
          stateMachines: stateMachine ?? undefined,
          /* A player who asked for less motion gets the first frame,
             which is still the art, just not moving. */
          autoplay: !still,
          layout: new rive.Layout({
            fit: fit === "cover" ? rive.Fit.Cover : rive.Fit.Contain,
            alignment: rive.Alignment.Center,
          }),
          onLoad: () => {
            if (!live) return;
            /* Match the drawing surface to the box's real pixel size,
               or the art renders soft on a phone. */
            built.resizeDrawingSurfaceToCanvas();
          },
          onLoadError: () => {
            if (live) setFailed(true);
          },
        });

        instance = built;
        if (!live) built.cleanup();
      } catch {
        if (live) setFailed(true);
      }
    })();

    /* Keep it crisp through rotation and resizes. */
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => instance?.resizeDrawingSurfaceToCanvas());
    observer?.observe(element);

    return () => {
      live = false;
      observer?.disconnect();
      instance?.cleanup();
      instance = null;
    };
  }, [url, artboard, stateMachine, fit]);

  if (failed) return null;

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className={cn("pointer-events-none block size-full", className)}
    />
  );
}
