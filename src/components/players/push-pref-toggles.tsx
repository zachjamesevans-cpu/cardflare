"use client";

import { useOptimistic, useState, useTransition } from "react";

import {
  PUSH_GROUPS,
  type PushGroup,
  type PushPrefs,
} from "@/lib/notifications/push-prefs";
import { setPushPrefAction } from "@/lib/notifications/push-actions";

/**
 * The four push switches: offers, messages, nights, social.
 *
 * One row per group, drawn the way the Rooms switch is drawn, so the
 * settings page reads as one column of the same control. Each flip is
 * optimistic: the switch moves at once, the action runs behind it, and
 * on failure the saved truth paints back with a line saying so. Saved
 * to the account, so the app (mobile/src/screens/settings.tsx) draws
 * the same four switches from the same answer. The Inbox keeps every
 * notice whatever these say: this is only about the phone buzzing.
 */
export function PushPrefToggles({ initial }: { initial: PushPrefs }) {
  const [pending, start] = useTransition();
  const [truth, setTruth] = useState(initial);
  const [prefs, flip] = useOptimistic(
    truth,
    (state: PushPrefs, change: { group: PushGroup; on: boolean }) => ({
      ...state,
      [change.group]: change.on,
    }),
  );
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {PUSH_GROUPS.map(({ key, label, line }) => (
        <label
          key={key}
          className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border bg-elevated p-3"
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-semibold text-text-primary">{label}</span>
            <span className="text-sm text-text-secondary">{line}</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={prefs[key]}
            aria-checked={prefs[key]}
            aria-label={label}
            disabled={pending}
            onChange={(event) => {
              const next = event.target.checked;
              setError(null);
              start(async () => {
                flip({ group: key, on: next });
                const result = await setPushPrefAction(key, next);
                if (result.ok) setTruth(result.prefs);
                else setError(result.message || "Could not save that.");
              });
            }}
            className="size-5 shrink-0 cursor-pointer rounded-[6px] border border-border-strong bg-canvas accent-accent"
          />
        </label>
      ))}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
