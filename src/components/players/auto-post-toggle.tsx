"use client";

import { useOptimistic, useState, useTransition } from "react";
import { DoorOpen } from "lucide-react";

import { setAutoPostAction } from "@/lib/events/auto-post-actions";

/**
 * "Post my Flares when I join a room", on by default.
 *
 * The founder: "I wonder if it's best to just join a room and all the
 * flares immediately get posted. That's kinda the whole point of
 * cardflare." So joining does, and this is the one way to say no: for
 * the person who wants to walk in and browse first. Saved to the
 * account, so it follows to the app (mobile/src/screens/settings.tsx
 * draws the same switch).
 */
export function AutoPostToggle({ current }: { current: boolean }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useOptimistic(current);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <DoorOpen className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-text-primary">Rooms</p>
          <p className="text-sm text-text-secondary">
            When you join a room, your open Flares go up on its board. Turn this off to
            walk in and browse first.
          </p>
        </div>
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border bg-elevated p-3">
        <span className="text-sm font-semibold text-text-primary">
          Post my Flares when I join a room
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={on}
          aria-checked={on}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.checked;
            setError(null);
            start(async () => {
              setOn(next);
              const result = await setAutoPostAction(next);
              if (!result.ok) setError(result.error ?? "Could not save that.");
            });
          }}
          className="size-5 cursor-pointer rounded-[6px] border border-border-strong bg-canvas accent-accent"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
