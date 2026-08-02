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
 * No separate sign-up step, because a second screen between the QR code and
 * the room is friction in the one place the product cannot afford it.
 *
 * A returning player's name is filled in but editable. It used to be fixed
 * text with no way to change it, which stranded anyone who had made a typo or
 * simply wanted to be called something else — the only route was to leave and
 * lose the session. Editing it renames the same session rather than starting a
 * new one, so the binder and everything else stays attached.
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
  const returning = Boolean(knownAs);

  return (
    <form
      key={submitted}
      action={formAction}
      noValidate
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="code" value={code} />

      <Field
        name="displayName"
        label={returning ? "Joining as" : "What should other players call you?"}
        hint={
          returning
            ? "Change it if you like — your cards and history stay with you."
            : "Shown to other people in this room. No account needed."
        }
        error={error}
      >
        <TextInput
          {...fieldIds("displayName")}
          name="displayName"
          defaultValue={submitted || knownAs || ""}
          required
          /* Not focused for a returning player: their name is already right,
             and stealing focus pops a keyboard over the Join button. */
          autoFocus={!returning}
          autoComplete="nickname"
          maxLength={DISPLAY_NAME_MAX}
          placeholder="Zach"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy("displayName", !!error, true)}
        />
      </Field>

      <SubmitButton label={returning ? "Join this room" : "Join the room"} />
    </form>
  );
}
