"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/cn";

/** How far a drag on the handle has to travel to close the sheet. */
const DRAG_CLOSE_PX = 110;
/** The close animation's length, before the route goes back. */
const CLOSE_MS = 220;

/**
 * A card opened over the page it was clicked on, as a sheet: it springs up
 * from the bottom (into the middle on a wide screen) over the page,
 * blurred and dimmed behind it. The founder: "the whole pop up thing we
 * have now is kind of buns", then yes to a sheet. The app opens cards as
 * iOS's own sheet, the same idea.
 *
 * Closing slides it away first, then goes back, so the page underneath is
 * exactly where it was. Escape, the close button, a click on the blur and
 * a drag down on the handle all close it. A card's own URL still opens
 * the full page (src/app/cards/[cardId]).
 */
export function CardModal({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState(0);
  const dragFrom = useRef<number | null>(null);

  const close = useCallback(() => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => router.back(), CLOSE_MS);
  }, [closing, router]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [close]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Card"
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label="Close card"
        onClick={close}
        className={cn(
          "absolute inset-0 cursor-default bg-black/55 backdrop-blur-md",
          closing ? "cf-sheet-backdrop-out" : "cf-sheet-backdrop-in",
        )}
      />
      <div
        style={
          drag > 0
            ? { transform: `translateY(${drag}px)`, transition: "none" }
            : undefined
        }
        className={cn(
          "relative flex max-h-[calc(100dvh-3.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-[var(--radius-panel)] border border-border bg-surface shadow-[var(--shadow-panel)] transition-transform duration-200 sm:max-h-[90dvh] sm:rounded-[var(--radius-panel)]",
          closing ? "cf-sheet-out" : "cf-sheet-in",
        )}
      >
        {/* The handle: says the sheet can be pulled down, and is where. */}
        <div
          className="flex cursor-grab touch-none justify-center pt-2.5 pb-1 active:cursor-grabbing"
          onPointerDown={(event) => {
            dragFrom.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (dragFrom.current === null) return;
            setDrag(Math.max(0, event.clientY - dragFrom.current));
          }}
          onPointerUp={() => {
            const pulled = drag;
            dragFrom.current = null;
            if (pulled > DRAG_CLOSE_PX) close();
            else setDrag(0);
          }}
          onPointerCancel={() => {
            dragFrom.current = null;
            setDrag(0);
          }}
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-10 rounded-full bg-border-strong"
          />
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute top-2 right-2 z-10 flex size-8 cursor-pointer items-center justify-center rounded-full bg-elevated text-text-primary transition-colors hover:bg-canvas"
        >
          <X className="size-[1.1rem]" aria-hidden="true" />
        </button>
        <div className="overflow-y-auto px-4 pt-2 pb-8 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
