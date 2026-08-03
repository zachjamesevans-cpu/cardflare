"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { Field, fieldIds } from "@/components/ui/field";
import { requestPasswordReset } from "@/lib/auth/actions";
import { RESET_REQUEST_IDLE } from "@/lib/auth/state";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Sending…" : "Email me a reset link"}
    </Button>
  );
}

export function ResetRequestForm() {
  const [state, formAction] = useActionState(requestPasswordReset, RESET_REQUEST_IDLE);

  if (state.status === "sent") {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-4 rounded-[var(--radius-panel)] border border-accent/30 bg-accent/[0.06] px-6 py-10 text-center"
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-accent/15">
          <CheckCircle2 className="size-6 text-accent" aria-hidden="true" />
        </span>
        <h2 className="text-xl font-bold text-text-primary">Check your email</h2>
        <p className="max-w-sm text-pretty text-text-secondary">
          If that address belongs to a CardFlare account, a link to set a new password
          is on its way. The link works once and expires shortly.
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      noValidate
      className="flex flex-col gap-5 rounded-[var(--radius-panel)] border border-border bg-surface p-6 sm:p-8"
    >
      <p
        role="alert"
        className={
          state.status === "error"
            ? "rounded-[var(--radius-control)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
            : "sr-only"
        }
      >
        {state.status === "error" ? state.message : ""}
      </p>

      <Field name="email" label="Email address">
        <TextInput
          {...fieldIds("email")}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoFocus
          required
        />
      </Field>

      <SubmitButton />

      {/*
       * Said plainly, because an invited store arriving here has never had a
       * password and would otherwise reasonably assume this page is not for
       * them.
       */}
      <p className="text-sm leading-relaxed text-text-muted">
        This is also how you set a password for the first time. Use the address your
        invitation was sent to.
      </p>
    </form>
  );
}
