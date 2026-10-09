"use client";

import { useState } from "react";

import { BinderCover } from "@/components/binder/binder-cover";
import { BringingPicker } from "@/components/nights/bringing-picker";
import { buttonStyles } from "@/components/ui/button";
import {
  BRINGING_EDIT,
  bringingLine,
  yourBindersTitle,
} from "@/lib/events/night-binder-rules";
import type { NightBinderState } from "@/lib/events/night-binders";

/** The button with nothing picked yet. */
export const PICK_BINDERS = "Pick binders";

/** How many covers the stack shows before "+N". */
const STACK = 3;

/**
 * Your binders for tonight: the night's own row for a player who is
 * going, "2 binders selected · 47 cards" with the picked covers fanned
 * beside it, and Edit to open the picker again.
 *
 * The founder (2026-10-09): "On the Night detail screen, display
 * something like: Your Binders for Tonight '2 binders selected · 47
 * cards'. Allow them to tap to view or edit." Drawn only while the
 * night still takes changes; the page leaves it out otherwise. With
 * nothing picked the line is the nudge and the button says Pick
 * binders. A save repaints the page, so the night's matches take the
 * new binders in at once. The app's room screen draws the same row.
 */
export function YourBinders({
  eventId,
  code,
  state,
}: {
  eventId: string;
  code: string;
  state: NightBinderState;
}) {
  const [current, setCurrent] = useState(state);
  const [open, setOpen] = useState(false);

  /* A refresh brings the server's picks: they win. */
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    setCurrent(state);
  }

  const picked = current.binders.filter((binder) => binder.selected);
  const shown = picked.slice(0, STACK);
  const more = picked.length - shown.length;

  return (
    <section
      aria-labelledby="your-binders"
      className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3"
    >
      {shown.length > 0 && (
        <span className="flex shrink-0 items-center" aria-hidden="true">
          {shown.map((binder, index) => (
            <BinderCover
              key={binder.id}
              cover={binder.cover}
              label={binder.name}
              size="xs"
              className={index > 0 ? "-ml-7" : undefined}
            />
          ))}
          {more > 0 && (
            <span className="-ml-3 inline-flex h-6 min-w-6 items-center justify-center self-end rounded-full border border-border bg-elevated px-1.5 text-[11px] font-semibold text-text-secondary tabular-nums">
              +{more}
            </span>
          )}
        </span>
      )}

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 id="your-binders" className="text-sm font-semibold text-text-primary">
          {yourBindersTitle(current.dayWord)}
        </h2>
        <p className="text-xs text-text-secondary tabular-nums">
          {bringingLine(current.selectedCount, current.selectedCards)}
        </p>
      </span>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonStyles(
          current.selectedCount > 0 ? "secondary" : "primary",
          "sm",
        )}
      >
        {current.selectedCount > 0 ? BRINGING_EDIT : PICK_BINDERS}
      </button>

      <BringingPicker
        eventId={eventId}
        code={code}
        open={open}
        state={current}
        onClose={() => setOpen(false)}
        onSaved={setCurrent}
      />
    </section>
  );
}
