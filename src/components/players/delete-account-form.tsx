"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { deleteAccountAction } from "@/lib/players/profile-actions";
import { PROFILE_IDLE, type ProfileState } from "@/lib/players/profile-schema";

/**
 * Deleting your own account.
 *
 * Closed by default: one line and a button that only reveals the form,
 * so the most destructive control on the site cannot be hit in passing.
 * Open, it asks for the handle typed back, and the button stays off
 * until the typed handle matches. The server checks the same thing.
 */
export function DeleteAccountForm({ handle }: { handle: string }) {
  const [state, action] = useActionState<ProfileState, FormData>(
    deleteAccountAction,
    PROFILE_IDLE,
  );
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const matches = typed.trim().replace(/^@/, "").toLowerCase() === handle.toLowerCase();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-fit text-sm text-danger underline-offset-4 hover:underline"
      >
        Delete your account
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-sm text-text-secondary">
        This removes your profile, your Flares, your lists, your showcase and everything
        you have unlocked. It cannot be undone. Type your handle,{" "}
        <span className="font-mono text-text-primary">@{handle}</span>, to confirm.
      </p>

      <div className="flex flex-wrap gap-2">
        <TextInput
          name="confirmHandle"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={`@${handle}`}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-label="Type your handle to confirm"
          className="min-w-0 flex-1 basis-48"
        />
        <DeleteButton enabled={matches} />
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTyped("");
          }}
          className="text-sm text-text-muted underline-offset-4 hover:underline"
        >
          Keep it
        </button>
      </div>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}

function DeleteButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={!enabled || pending}>
      {pending ? "Deleting…" : "Delete my account"}
    </Button>
  );
}
