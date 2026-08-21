"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, Trash2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import {
  deletePlayerAction,
  deleteStoreAction,
  previewDeletionAction,
} from "@/lib/admin/deletion-actions";
import {
  DELETE_IDLE,
  realCollateral,
  type DeletePreview,
  type DeleteState,
} from "@/lib/admin/deletion-schema";

/**
 * Deleting something, with the damage shown first.
 *
 * The list is the point. Every foreign key into stores and players is
 * ON DELETE CASCADE and the tree runs two levels deep — deleting a shop
 * deletes its rooms, and deleting a room deletes every Flare posted on
 * it. The database does that instantly and says nothing, so this says
 * it instead, counted from the real rows rather than described in
 * general terms.
 *
 * Closed by default. A destructive control that is open on arrival is a
 * control somebody eventually presses while looking at something else.
 */
function ConfirmButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="danger" size="sm" disabled={pending}>
      <Trash2 className="size-4" aria-hidden="true" />
      {pending ? "Deleting…" : label}
    </Button>
  );
}

export function DeletePanel({
  kind,
  id,
  name,
}: {
  kind: "store" | "player";
  id: string;
  name: string;
}) {
  const [state, action] = useActionState<DeleteState, FormData>(
    kind === "store" ? deleteStoreAction : deletePlayerAction,
    DELETE_IDLE,
  );
  const [open, setOpen] = useState(false);
  /*
   * Fetched when the panel opens, never on page load. Counting the
   * collateral is a dozen queries across a dozen tables, and doing that
   * for every row of a hundred-player list to fill in a panel almost
   * nobody opens is a page made slow by a button nobody pressed.
   */
  const [preview, setPreview] = useState<DeletePreview | null>(null);
  const [loading, setLoading] = useState(false);

  const reveal = async () => {
    setOpen(true);

    if (preview) return;

    setLoading(true);
    try {
      setPreview(await previewDeletionAction(kind, id));
    } finally {
      setLoading(false);
    }
  };

  const losses = preview ? realCollateral(preview.collateral) : [];
  const noun = kind === "store" ? "store" : "player";

  if (state.status === "deleted") {
    return (
      <Card className="p-4">
        <p className="text-sm text-text-secondary" role="status">
          {state.message}
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 border-danger/40 p-4">
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-danger">Delete this {noun}</p>
        <p className="text-sm text-text-secondary">
          Permanent. There is no undo and no backup you can reach from here.
        </p>
      </div>

      {!open ? (
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void reveal()}
          >
            Delete {name}…
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {loading && (
            <p className="text-sm text-text-muted">Working out what this deletes…</p>
          )}

          {/* Counted from the real rows. "2 rooms" is a fact an admin can
              act on; "related records will be removed" is not. */}
          {!loading && preview && losses.length === 0 && (
            <p className="text-sm text-text-secondary">
              Nothing else depends on this {noun}. It deletes cleanly.
            </p>
          )}

          {losses.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-elevated p-3">
              <p className="text-sm font-semibold text-text-primary">
                This also deletes
              </p>
              <ul className="flex flex-col gap-0.5 text-sm text-text-secondary">
                {losses.map((entry) => (
                  <li key={entry.label} className="tabular-nums">
                    {entry.count} {entry.label}
                    {entry.count === 1 ? "" : "s"}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(preview?.warnings ?? []).map((warning) => (
            <p key={warning} className="flex items-start gap-2 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {warning}
            </p>
          ))}

          <form action={action} className="flex flex-col gap-2">
            <input
              type="hidden"
              name={kind === "store" ? "storeId" : "playerId"}
              value={id}
              readOnly
            />

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-secondary">
                Type <span className="font-semibold text-text-primary">{name}</span> to
                confirm
              </span>
              <TextInput
                name="confirmName"
                autoComplete="off"
                aria-label={`Type ${name} to confirm`}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <ConfirmButton label={`Delete this ${noun} permanently`} />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>

          {state.message && (
            <p className="text-sm text-danger" role="alert">
              {state.message}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
