"use client";

import { Plus } from "lucide-react";

import { POST_A_FLARE } from "@/lib/events/night-copy";

/**
 * "+ Flare": the floating button that opens the composer on a night.
 *
 * The founder (2026-10-03): "The current giant lime 'Post a Flare' bar
 * is too visually dominant. Replace with a smaller contextual CTA:
 * floating button '+ Flare'... The bottom navigation already contains
 * Flare; do not duplicate a massive CTA."
 *
 * Bottom right, above the dock, in the accent; its accessible name is
 * still "Post a Flare", which is what it does. It is the trigger of
 * RoomComposerDoor, which draws it only for a signed-in viewer in a
 * writable phase and swaps it for the composer when it is pressed. On
 * a wide screen it sits at the column's edge rather than the window's,
 * so it stays near what it acts on. The app's flare-fab.tsx draws the
 * same button with the same words; tests/unit/nights2-parity.test.ts
 * holds the two together.
 */
export function FlareFab({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={POST_A_FLARE}
      title={POST_A_FLARE}
      className="fixed right-[max(1rem,calc((100vw-42rem)/2))] bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 inline-flex h-11 cursor-pointer items-center gap-1 rounded-full bg-accent pr-4 pl-3 text-sm font-semibold text-accent-contrast shadow-[0_0_28px_-8px_var(--color-accent)] transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none"
    >
      <Plus className="size-5" aria-hidden="true" />
      Flare
    </button>
  );
}
