"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { setPlayerTierAction, updatePlayerAction } from "@/lib/admin/record-actions";
import { RECORD_EDIT_IDLE } from "@/lib/admin/record-schema";
import { TIERS } from "@/lib/tiers";

/**
 * Renaming a player from the console.
 *
 * Folded shut until asked for: the players page is a list to read, and a
 * row full of open text inputs reads as a form to fill in. "Rename"
 * turns one row into an editor and nothing else moves.
 */
function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

export function EditPlayerName({
  playerId,
  displayName,
}: {
  playerId: string;
  displayName: string;
}) {
  const [state, formAction] = useActionState(updatePlayerAction, RECORD_EDIT_IDLE);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
          Rename
        </Button>
        {state.status === "saved" && (
          <span className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Check className="size-3.5 text-accent" aria-hidden="true" />
            {state.message}
          </span>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-2">
      <input type="hidden" name="playerId" value={playerId} />

      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          name="displayName"
          aria-label="Display name"
          required
          defaultValue={displayName}
          className="w-48"
        />
        <SaveButton />
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>

      {state.status === "error" && (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-danger">
          <X className="size-3.5" aria-hidden="true" />
          {state.message}
        </p>
      )}
    </form>
  );
}

/**
 * The membership tier, switched from the row. A select and a save:
 * tiers are an admin fact for now (no billing attached), so the control
 * is deliberately as plain as the rename beside it.
 */
export function EditPlayerTier({ playerId, tier }: { playerId: string; tier: string }) {
  const [state, formAction] = useActionState(setPlayerTierAction, RECORD_EDIT_IDLE);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="playerId" value={playerId} />
      <label className="text-xs text-text-muted" htmlFor={`tier-${playerId}`}>
        Tier
      </label>
      <select
        id={`tier-${playerId}`}
        name="tier"
        defaultValue={tier}
        className="rounded-[var(--radius-control)] border border-border bg-surface px-2 py-1 text-sm text-text-primary"
      >
        {TIERS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <SaveButton />
      {state.status !== "idle" && (
        <span className="text-xs text-text-secondary">{state.message}</span>
      )}
    </form>
  );
}
