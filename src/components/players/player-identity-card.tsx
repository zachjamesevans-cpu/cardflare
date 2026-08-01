"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { describedBy, Field, fieldIds } from "@/components/ui/field";
import { leaveAsPlayer, renamePlayer } from "@/lib/players/actions";
import {
  DISPLAY_NAME_MAX,
  JOIN_PLAYER_IDLE,
  type JoinPlayerState,
  type PlayerIdentity,
} from "@/lib/players/schema";

function PendingButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? busy : idle}
    </Button>
  );
}

function RenameForm({
  currentName,
  onDone,
}: {
  currentName: string;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState<JoinPlayerState, FormData>(
    async (previous, formData) => {
      const result = await renamePlayer(previous, formData);
      if (result.status === "idle") onDone();
      return result;
    },
    JOIN_PLAYER_IDLE,
  );

  const error = state.status === "error" ? state.message : undefined;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <Field name="displayName" label="Display name" error={error}>
        <TextInput
          {...fieldIds("displayName")}
          name="displayName"
          defaultValue={state.status === "error" ? state.displayName : currentName}
          required
          autoFocus
          maxLength={DISPLAY_NAME_MAX}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy("displayName", !!error, false)}
        />
      </Field>

      <div className="flex flex-wrap gap-3">
        <PendingButton idle="Save" busy="Saving…" />
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * The signed-in guest's own view of their identity.
 *
 * Client-side only for the rename disclosure; everything it shows is rendered
 * from props the server resolved.
 */
export function PlayerIdentityCard({ player }: { player: PlayerIdentity }) {
  const [renaming, setRenaming] = useState(false);

  if (renaming) {
    return (
      <RenameForm currentName={player.displayName} onDone={() => setRenaming(false)} />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-text-muted">You are playing as</p>
          <p className="truncate text-2xl font-bold text-text-primary">
            {player.displayName}
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={() => setRenaming(true)}
          aria-label="Change your display name"
        >
          <Pencil className="size-4" aria-hidden="true" />
          Change
        </Button>
      </div>

      <form action={leaveAsPlayer}>
        <button
          type="submit"
          className="text-sm text-text-muted underline underline-offset-4 transition-colors hover:text-text-secondary"
        >
          Leave and forget this device
        </button>
      </form>
    </div>
  );
}
