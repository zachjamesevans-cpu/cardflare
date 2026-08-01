"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { describedBy, Field, fieldIds } from "@/components/ui/field";
import { joinEventAction } from "@/lib/events/join-event-actions";
import {
  DISPLAY_NAME_MAX,
  JOIN_PLAYER_IDLE,
  type JoinPlayerState,
} from "@/lib/players/schema";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Joining…" : label}
    </Button>
  );
}

/**
 * One submission from scanning to being in the room.
 *
 * A player who already has an identity taps a single button. A new player
 * types a name in the same form — no separate sign-up step, because a second
 * screen between the QR code and the room is friction in the one place the
 * product cannot afford it.
 */
export function JoinEventForm({
  code,
  knownAs,
}: {
  code: string;
  /** Set when the browser already has a player session. */
  knownAs?: string;
}) {
  const [state, formAction] = useActionState<JoinPlayerState, FormData>(
    joinEventAction,
    JOIN_PLAYER_IDLE,
  );

  const error = state.status === "error" ? state.message : undefined;
  const submitted = state.status === "error" ? state.displayName : "";

  return (
    <form
      key={submitted}
      action={formAction}
      noValidate
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="code" value={code} />

      {knownAs ? (
        <>
          <p className="text-text-secondary">
            You&rsquo;ll join as{" "}
            <strong className="font-semibold text-text-primary">{knownAs}</strong>.
          </p>
          {error && (
            <p
              role="alert"
              className="rounded-[var(--radius-control)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
            >
              {error}
            </p>
          )}
        </>
      ) : (
        <Field
          name="displayName"
          label="What should other players call you?"
          hint="Shown to other people in this room. No account needed."
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
      )}

      <SubmitButton label={knownAs ? "Join this room" : "Join the room"} />
    </form>
  );
}
