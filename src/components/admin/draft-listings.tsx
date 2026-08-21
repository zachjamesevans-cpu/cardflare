"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { publishManyAction } from "@/lib/stores/listing-actions";
import { LISTING_IDLE } from "@/lib/stores/listing-schema";

/** A draft, as the console lists it. */
export interface DraftListing {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
}

function PublishButton({ count }: { count: number }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending || count === 0}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Publishing…" : `Publish ${count} selected`}
    </Button>
  );
}

/**
 * Everything imported and not yet released.
 *
 * An import creates dozens at once and every one of them is invisible to
 * players until somebody says otherwise. Without this the drafts are
 * findable only by opening each store in turn, which is how a directory
 * ends up half-published and nobody can tell which half.
 */
export function DraftListings({ drafts }: { drafts: DraftListing[] }) {
  const [state, action] = useActionState(publishManyAction, LISTING_IDLE);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  if (drafts.length === 0) return null;

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 font-semibold text-text-primary">
          <EyeOff className="size-4 text-text-muted" aria-hidden="true" />
          {drafts.length} draft {drafts.length === 1 ? "listing" : "listings"}
        </h3>
        <p className="text-sm text-text-secondary">
          Imported and hidden from players. Publish the ones you want live; open any
          store to edit its details, verify it, or set Ultra.
        </p>
      </div>

      {state.message && (
        <p
          role="status"
          className={`text-sm ${state.status === "error" ? "text-danger" : "text-accent"}`}
        >
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-text-muted tabular-nums">
          {picked.size} of {drafts.length} selected
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setPicked(new Set(drafts.map((draft) => draft.id)))}
        >
          Select all
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setPicked(new Set())}
        >
          Clear
        </Button>
      </div>

      <ul className="flex max-h-96 flex-col divide-y divide-border overflow-y-auto">
        {drafts.map((draft) => (
          <li key={draft.id} className="flex items-center gap-3 py-2">
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-accent"
              checked={picked.has(draft.id)}
              onChange={() => toggle(draft.id)}
              aria-label={`Select ${draft.name}`}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
              {draft.name}
            </span>
            <span className="shrink-0 text-xs text-text-muted">
              {[draft.city, draft.region].filter(Boolean).join(", ")}
            </span>
          </li>
        ))}
      </ul>

      <form action={action}>
        <input type="hidden" name="storeIds" value={[...picked].join(",")} readOnly />
        <PublishButton count={picked.size} />
      </form>
    </Card>
  );
}
