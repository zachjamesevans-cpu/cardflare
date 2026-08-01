"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { describedBy, Field, fieldIds } from "@/components/ui/field";
import { joinAsPlayer } from "@/lib/players/actions";
import {
  DISPLAY_NAME_MAX,
  JOIN_PLAYER_IDLE,
  type JoinPlayerState,
} from "@/lib/players/schema";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Joining…" : "Continue"}
    </Button>
  );
}

export function JoinForm() {
  const [state, formAction] = useActionState<JoinPlayerState, FormData>(
    joinAsPlayer,
    JOIN_PLAYER_IDLE,
  );

  const error = state.status === "error" ? state.message : undefined;

  // React resets an uncontrolled form once the action resolves, which would
  // wipe a name that was rejected for being one character short. Keying on the
  // outcome remounts the field with the value echoed back.
  const submitted = state.status === "error" ? state.displayName : "";

  return (
    <form
      key={submitted}
      action={formAction}
      noValidate
      className="flex flex-col gap-5 rounded-[var(--radius-panel)] border border-border bg-surface p-6 sm:p-8"
    >
      <Field
        name="displayName"
        label="What should other players call you?"
        hint="Shown to other people in the room. A first name or handle is plenty."
        error={error}
      >
        <TextInput
          {...fieldIds("displayName")}
          name="displayName"
          defaultValue={submitted}
          required
          autoFocus
          autoComplete="nickname"
          maxLength={DISPLAY_NAME_MAX}
          placeholder="Zach"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy("displayName", !!error, true)}
        />
      </Field>

      <SubmitButton />

      <p className="text-center text-xs text-text-muted">
        No account, no password, no email address.
      </p>
    </form>
  );
}
