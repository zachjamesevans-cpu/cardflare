"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/controls";
import { deleteAccountAction } from "@/lib/players/profile-actions";
import { PROFILE_IDLE, type ProfileState } from "@/lib/players/profile-state";

/**
 * Deleting your own account.
 *
 * Closed by default: one big red button and nothing else (the founder:
 * "the delete your account should be a big red button. then you click
 * it and it goes over that extra text"). It only reveals the form, so
 * the most destructive control on the site cannot be hit in passing.
 * Open, the card says what goes, asks for the handle typed back, and
 * the button stays off until the typed handle matches. The server
 * checks the same thing. The app's Settings does the same.
 */
export function DeleteAccountForm({
  handle,
  note,
}: {
  handle: string;
  note?: ReactNode;
}) {
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
        className="h-12 w-full cursor-pointer rounded-[var(--radius-control)] bg-[#e5484d] text-base font-semibold text-white transition-colors hover:bg-[#d63f44] active:scale-[0.99]"
      >
        Delete your account
      </button>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-text-primary">Delete your account</p>
          <p className="text-sm text-text-secondary">
            Everything goes: your profile, Flares, hunts, binders, showcase, trade
            history, Embers and unlocks. There is no undo.
          </p>
          {note ? <p className="text-sm text-text-muted">{note}</p> : null}
        </div>
        <p className="text-sm text-text-secondary">
          Type your handle,{" "}
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
    </Card>
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
