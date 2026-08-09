"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { syncCollectionAction } from "@/lib/players/collection-actions";
import { SYNC_SINGLES_IDLE, type SyncOutcome } from "@/lib/singles/schema";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Importing…" : "Import collection"}
    </Button>
  );
}

function OutcomeLine({ outcome }: { outcome: SyncOutcome }) {
  return (
    <span>
      <strong className="font-semibold text-text-primary">
        {outcome.cardsMatched.toLocaleString()}
      </strong>{" "}
      {outcome.cardsMatched === 1 ? "card" : "cards"} imported from{" "}
      {outcome.linesSeen.toLocaleString()} lines
      {outcome.linesUnmatched > 0 &&
        ` · ${outcome.linesUnmatched.toLocaleString()} not recognised`}
    </span>
  );
}

/**
 * The collection import: one upload, one stat line, never a list.
 *
 * Same shape as the store's singles sync and for the same reason — a
 * thousand-card collection rendered as a list would be exactly the
 * redundancy the founder ruled out. The collection's whole job is to flag
 * Flares its owner can answer, quietly.
 */
export function SyncCollectionForm({
  lastSync,
}: {
  /** The previous import's stat line, already formatted by the page. */
  lastSync: {
    when: string;
    cardsMatched: number;
    linesUnmatched: number;
  } | null;
}) {
  const [state, formAction] = useActionState(syncCollectionAction, SYNC_SINGLES_IDLE);
  const formKey = JSON.stringify(state);

  return (
    <div className="flex flex-col gap-4">
      {lastSync ? (
        <p className="text-sm text-text-secondary">
          <strong className="font-semibold text-text-primary">
            {lastSync.cardsMatched.toLocaleString()}
          </strong>{" "}
          {lastSync.cardsMatched === 1 ? "card" : "cards"} in your collection · updated{" "}
          {lastSync.when}
          {lastSync.linesUnmatched > 0 &&
            ` · ${lastSync.linesUnmatched.toLocaleString()} lines not recognised`}
        </p>
      ) : (
        <p className="text-sm text-text-secondary">
          Nothing imported yet. Export your collection from Collectr and upload it here.
        </p>
      )}

      {state.status === "synced" && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-accent/30 bg-accent/[0.07] px-4 py-3 text-sm text-text-secondary"
        >
          <p className="flex items-start gap-2">
            <CheckCircle2
              className="mt-0.5 size-4 shrink-0 text-accent"
              aria-hidden="true"
            />
            <OutcomeLine outcome={state.outcome} />
          </p>
          {state.unmatchedSample.length > 0 && (
            <p className="text-xs text-text-muted">
              Not recognised: {state.unmatchedSample.join(", ")}
              {state.outcome.linesUnmatched > state.unmatchedSample.length && ", …"}
            </p>
          )}
        </div>
      )}

      <form key={formKey} action={formAction} className="flex flex-col gap-4">
        <p
          role="alert"
          className={
            state.status === "error"
              ? "rounded-[var(--radius-control)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
              : "sr-only"
          }
        >
          {state.status === "error" ? state.message : ""}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="max-w-full text-sm text-text-secondary file:mr-3 file:cursor-pointer file:rounded-[var(--radius-control)] file:border file:border-border file:bg-elevated file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-text-primary"
          />
          <SubmitButton />
        </div>

        <p className="text-xs text-text-muted">
          Your Collectr export (CSV). Private: rooms never show your collection to
          anyone. It only flags Flares you could answer, and your name appears only when
          you choose to offer. Prices in the file are ignored and never stored.
        </p>
      </form>
    </div>
  );
}
