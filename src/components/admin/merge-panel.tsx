"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, GitMerge } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, TextInput } from "@/components/ui/controls";
import { mergeStoresAction, previewMergeAction } from "@/lib/admin/merge-actions";
import type { MergePreview } from "@/lib/admin/merge-stores";
import type { MergeState } from "@/lib/admin/merge-actions";

/** One row of the pick list: every other store on the platform. */
export interface MergeCandidate {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  joinCode: string;
  /** From `duplicatesOf`: the rows that are probably this same shop. */
  likely: boolean;
}

const MERGE_IDLE: MergeState = { status: "idle" };

/** What the merge does, said before the button. Pinned by the parity test. */
export const MERGE_LINE =
  "Everything on this store moves to the store you pick, then this store is deleted. This cannot be undone.";

function candidateLabel(candidate: MergeCandidate): string {
  const place = [candidate.city, candidate.region].filter(Boolean).join(", ");
  return [candidate.name, place, candidate.joinCode].filter(Boolean).join(" · ");
}

function MergeButton({ into }: { into: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="danger" size="sm" disabled={pending}>
      <GitMerge className="size-4" aria-hidden="true" />
      {pending ? "Merging…" : `Merge into ${into}`}
    </Button>
  );
}

/**
 * Folding this store into another one.
 *
 * Modelled on the delete panel, and for the same reason: the damage is
 * printed before the button. The preview is the real count of what
 * moves, the warnings are the things an admin cannot undo (a counter
 * code that stops working), and a blocked merge shows the reason and
 * no button at all. The survivor's name is typed back, so a merge is
 * never one slip of a dropdown.
 *
 * Closed by default, like every destructive control in the console,
 * and drawn inside the Danger zone with the delete panel, first of the
 * two: it is the gentler answer to a duplicate, but it still ends in a
 * deleted store.
 */
export function MergePanel({
  fromId,
  fromName,
  candidates,
}: {
  fromId: string;
  fromName: string;
  candidates: MergeCandidate[];
}) {
  const [state, action] = useActionState<MergeState, FormData>(
    mergeStoresAction,
    MERGE_IDLE,
  );
  const [open, setOpen] = useState(false);
  const [intoId, setIntoId] = useState("");
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [loading, setLoading] = useState(false);

  const likely = candidates.filter((candidate) => candidate.likely);
  const others = candidates.filter((candidate) => !candidate.likely);

  const choose = async (id: string) => {
    setIntoId(id);
    setPreview(null);
    if (!id) return;

    setLoading(true);
    try {
      setPreview(await previewMergeAction(fromId, id));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3 border-warning/40 p-4">
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-text-primary">Merge into another store</p>
        <p className="text-sm text-text-secondary">{MERGE_LINE}</p>
      </div>

      {!open ? (
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setOpen(true)}
            disabled={candidates.length === 0}
          >
            Merge {fromName}…
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-secondary">The store that survives</span>
            <Select
              value={intoId}
              onChange={(event) => void choose(event.target.value)}
              aria-label="The store that survives"
            >
              <option value="">Pick a store…</option>
              {likely.length > 0 && (
                <optgroup label="Probably the same shop">
                  {likely.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidateLabel(candidate)}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={likely.length > 0 ? "Every other store" : "Stores"}>
                {others.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidateLabel(candidate)}
                  </option>
                ))}
              </optgroup>
            </Select>
          </label>

          {loading && (
            <p className="text-sm text-text-muted">Working out what this moves…</p>
          )}

          {!loading && intoId && !preview && (
            <p className="text-sm text-danger" role="alert">
              Could not read those two stores. Pick again.
            </p>
          )}

          {preview && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-text-secondary">
                Everything on{" "}
                <span className="font-semibold text-text-primary">
                  {preview.from.name}
                </span>{" "}
                moves to{" "}
                <span className="font-semibold text-text-primary">
                  {preview.into.name}
                </span>
                , then {preview.from.name} is deleted.
              </p>

              {/* Counted from the real rows, the way the delete panel does. */}
              {preview.moves.length === 0 ? (
                <p className="text-sm text-text-secondary">
                  Nothing else is attached to {preview.from.name}. Only the record
                  itself goes.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-elevated p-3">
                  <p className="text-sm font-semibold text-text-primary">This moves</p>
                  <ul className="flex flex-col gap-0.5 text-sm text-text-secondary">
                    {preview.moves.map((move) => (
                      <li key={move.label} className="tabular-nums">
                        {move.count} {move.label}
                        {move.count === 1 ? "" : "s"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {preview.warnings.map((warning) => (
                <p
                  key={warning}
                  className="flex items-start gap-2 text-sm text-warning"
                >
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  {warning}
                </p>
              ))}

              {preview.blocked ? (
                <p className="text-sm font-semibold text-danger" role="alert">
                  {preview.blocked}
                </p>
              ) : (
                <form action={action} className="flex flex-col gap-2">
                  <input type="hidden" name="fromId" value={fromId} readOnly />
                  <input type="hidden" name="intoId" value={preview.into.id} readOnly />

                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-text-secondary">
                      Type{" "}
                      <span className="font-semibold text-text-primary">
                        {preview.into.name}
                      </span>{" "}
                      to confirm
                    </span>
                    <TextInput
                      name="confirmName"
                      autoComplete="off"
                      aria-label={`Type ${preview.into.name} to confirm`}
                    />
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <MergeButton into={preview.into.name} />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setOpen(false);
                        setIntoId("");
                        setPreview(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}

          {!preview && (
            <div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  setIntoId("");
                }}
              >
                Cancel
              </Button>
            </div>
          )}

          {state.status === "error" && (
            <p className="text-sm text-danger" role="alert">
              {state.message}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
