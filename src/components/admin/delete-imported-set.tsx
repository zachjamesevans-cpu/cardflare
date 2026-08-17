"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteImportedSetAction } from "@/lib/admin/import-actions";
import { IMPORT_IDLE, type ImportState } from "@/lib/cards/import-schema";

/**
 * Removing an imported set entirely.
 *
 * The founder imported a manifest before its pictures, ended up with two
 * hundred artless cards, and had no way back: "there's also no way to
 * delete a set that gets imported this way." A door in needs a door out,
 * and "run some SQL" is not one when the console is where the mistake
 * was made.
 *
 * Two clicks, not one. This deletes rows other people's boards may be
 * pointing at, and a single button beside a list is exactly the shape
 * that gets pressed by accident. The confirm step says the set's own
 * code back, so the thing being destroyed is named at the moment of
 * agreeing to it.
 */
export function DeleteImportedSet({
  provider,
  setCode,
  printings,
}: {
  provider: string;
  setCode: string;
  printings: number;
}) {
  const [state, action] = useActionState<ImportState, FormData>(
    deleteImportedSetAction,
    IMPORT_IDLE,
  );

  const [asking, setAsking] = useState(false);

  if (state.status === "deleted") {
    return <p className="text-xs text-text-muted">{state.message}</p>;
  }

  if (!asking) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setAsking(true)}
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
        Remove
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="provider" value={provider} />
      <input type="hidden" name="setCode" value={setCode} />

      <span className="text-xs text-text-secondary">
        Remove {setCode} and its {printings} printing{printings === 1 ? "" : "s"}?
      </span>

      <ConfirmButton />

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setAsking(false)}
      >
        Keep it
      </Button>

      {state.status === "error" && (
        <span className="text-xs text-danger">{state.message}</span>
      )}
    </form>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Trash2 className="size-3.5" aria-hidden="true" />
      )}
      {pending ? "Removing…" : "Yes, remove it"}
    </Button>
  );
}
