"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { CircleCheck, CircleX, Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox, Select } from "@/components/ui/controls";
import { Field, fieldIds } from "@/components/ui/field";
import { syncCatalogAction } from "@/lib/cards/sync-actions";
import {
  describeCounts,
  SYNC_IDLE,
  type SyncActionState,
} from "@/lib/cards/sync-state";

/**
 * How long each mode is expected to take, so the operator knows whether a
 * spinner that has not moved for thirty seconds is normal.
 */
const MODES = [
  {
    value: "sample",
    label: "Sample: a few dozen cards, about a minute",
    blurb: "Enough to check the import is correct end to end. Safe to run repeatedly.",
  },
  {
    value: "full",
    label: "Full: the provider's entire catalog",
    blurb:
      "Thousands of records from a free service. Run it when you actually need the whole catalog, not to test.",
  },
] as const;

function SubmitButton({ mode }: { mode: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Syncing…" : mode === "full" ? "Run full sync" : "Run sample sync"}
    </Button>
  );
}

/**
 * Reports the run, counts and all.
 *
 * A sync that imported nothing and a sync that imported four thousand cards
 * both "succeed", and the difference is the only thing worth knowing — so the
 * numbers are the message rather than a checkmark.
 */
function Outcome({ state }: { state: SyncActionState }) {
  if (state.status === "idle") return null;

  const { Icon, tone, border, body } =
    state.status === "success"
      ? {
          Icon: CircleCheck,
          tone: "text-accent",
          border: "border-accent/30 bg-accent/[0.07]",
          body: `${state.mode === "full" ? "Full" : "Sample"} sync finished: ${describeCounts(state.counts)}.${
            state.counts.recordsFailed > 0
              ? " Rejected records are in card_sync_failures."
              : ""
          }`,
        }
      : state.status === "failed"
        ? {
            Icon: TriangleAlert,
            tone: "text-warning",
            border: "border-warning/30 bg-warning/[0.07]",
            body: state.message,
          }
        : {
            Icon: CircleX,
            tone: "text-danger",
            border: "border-danger/40 bg-danger/10",
            body: state.message,
          };

  return (
    <p
      role="status"
      className={`flex items-start gap-2 rounded-[var(--radius-control)] border px-4 py-3 text-sm text-text-secondary ${border}`}
    >
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden="true" />
      <span>{body}</span>
    </p>
  );
}

export function SyncCatalogForm({ providerName }: { providerName: string }) {
  const [state, formAction] = useActionState(syncCatalogAction, SYNC_IDLE);
  const [mode, setMode] = useState<string>("sample");

  const selected = MODES.find((option) => option.value === mode) ?? MODES[0];

  return (
    <div className="flex flex-col gap-4">
      <Outcome state={state} />

      <form action={formAction} className="flex flex-col gap-5">
        <Field name="mode" label="Mode" hint={selected.blurb}>
          <Select
            {...fieldIds("mode")}
            name="mode"
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            {MODES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        {/*
         * The confirmation only appears for the mode that needs it, and is
         * re-checked on the server — the checkbox is a speed bump, not the
         * control.
         */}
        {mode === "full" && (
          <Checkbox
            id="confirm"
            name="confirm"
            label={`Yes, pull the entire catalog from ${providerName}.`}
          />
        )}

        <div>
          <SubmitButton mode={mode} />
        </div>
      </form>

      <p className="border-t border-border pt-3 text-xs text-text-muted">
        Writes to <code>cards</code>, <code>card_printings</code> and{" "}
        <code>card_sync_runs</code>. Nothing is ever deleted, and re-running updates
        rather than duplicates. A run that outlives the request limit is recorded as
        abandoned after 20 minutes and can be started again.
      </p>
    </div>
  );
}
