"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { describedBy, Field, fieldIds } from "@/components/ui/field";
import { lookUpJoinCode } from "@/lib/events/join-actions";
import { JOIN_CODE_IDLE, type JoinCodeState } from "@/lib/events/join-state";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Finding…" : "Find event"}
    </Button>
  );
}

export function JoinCodeForm() {
  const [state, formAction] = useActionState<JoinCodeState, FormData>(
    lookUpJoinCode,
    JOIN_CODE_IDLE,
  );

  const error = state.status === "error" ? state.message : undefined;

  return (
    <form
      key={JSON.stringify(state)}
      action={formAction}
      noValidate
      className="flex flex-col gap-5 rounded-[var(--radius-panel)] border border-border bg-surface p-6 sm:p-8"
    >
      <Field
        name="code"
        label="Event code"
        hint="The six-character code on the sheet at the counter."
        error={error}
      >
        <TextInput
          {...fieldIds("code")}
          name="code"
          required
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={12}
          defaultValue={state.status === "error" ? state.code : ""}
          placeholder="K3M9PZ"
          className="text-center font-mono text-2xl tracking-[0.3em] uppercase"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy("code", !!error, true)}
        />
      </Field>

      <SubmitButton />
    </form>
  );
}
