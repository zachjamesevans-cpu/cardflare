"use client";

import { useId, useState } from "react";
import { Info } from "lucide-react";

import {
  BOARD_EARLY,
  BOARD_EARLY_LINE,
  BOARD_EARLY_LONG,
} from "@/lib/events/night-copy";

/**
 * "Board open early. Post now so players know what to bring." and the
 * small ⓘ that unfolds the long version under it.
 *
 * The founder (2026-10-03): "REMOVE THE GIANT 'BOARD OPEN EARLY' CARD.
 * Replace it with a small contextual banner... Tapping the information
 * icon can reveal the longer explanation. Do not permanently show a
 * large paragraph." One line in the accent's tint, the paragraph
 * behind the icon, and nothing that scrolls the matches off the first
 * screen. The app's early-banner.tsx draws the same line with the same
 * words; tests/unit/nights2-parity.test.ts holds the two together.
 */
export function EarlyBanner() {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-accent/30 bg-accent/[0.07] px-3 py-2">
      <p className="flex items-center gap-2 text-sm">
        <span className="min-w-0 flex-1 text-text-secondary">
          <strong className="font-semibold text-text-primary">{BOARD_EARLY}.</strong>{" "}
          {BOARD_EARLY_LINE}
        </span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={id}
          aria-label="About the early board"
          className="-m-1 shrink-0 cursor-pointer rounded-full p-1 text-text-muted transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <Info className="size-4" aria-hidden="true" />
        </button>
      </p>
      {open && (
        <p id={id} className="text-sm leading-5 text-text-secondary">
          {BOARD_EARLY_LONG}
        </p>
      )}
    </div>
  );
}
