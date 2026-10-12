"use client";

import { useSyncExternalStore } from "react";

import {
  BACKDROP_KEY,
  PURE_BLACK_LABEL,
  PURE_BLACK_LINE,
} from "@/lib/players/backdrop";

/**
 * The Pure black switch, drawn the way the push switches are. It sets
 * `data-backdrop` on <html> at once and remembers the choice in this
 * browser; the head script in app/layout.tsx puts it back on every page
 * before it paints. The app draws the same row (mobile/src/screens/
 * settings.tsx, LookCard).
 */
/* The attribute on <html> is the truth; the server draws it off. */
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const isBlack = () => document.documentElement.dataset.backdrop === "black";

function choose(black: boolean) {
  if (black) document.documentElement.dataset.backdrop = "black";
  else delete document.documentElement.dataset.backdrop;
  try {
    localStorage.setItem(BACKDROP_KEY, black ? "black" : "green");
  } catch {
    /* Private mode: applied for this page only. */
  }
  listeners.forEach((listener) => listener());
}

export function BackdropToggle() {
  const on = useSyncExternalStore(subscribe, isBlack, () => false);

  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border bg-elevated p-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold text-text-primary">
          {PURE_BLACK_LABEL}
        </span>
        <span className="text-sm text-text-secondary">{PURE_BLACK_LINE}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        aria-checked={on}
        aria-label={PURE_BLACK_LABEL}
        onChange={(event) => choose(event.target.checked)}
        className="size-5 shrink-0 cursor-pointer rounded-[6px] border border-border-strong bg-canvas accent-accent"
      />
    </label>
  );
}
