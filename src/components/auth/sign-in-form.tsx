"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { Field, fieldIds } from "@/components/ui/field";
import { requestSignInLink } from "@/lib/auth/actions";
import { SIGN_IN_IDLE } from "@/lib/auth/state";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Sending…" : "Email me a sign-in link"}
    </Button>
  );
}

export function SignInForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(requestSignInLink, SIGN_IN_IDLE);

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
          If that address belongs to a CardFlare account, a sign-in link is on its way.
          The link works once and expires shortly.
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
      {next && <input type="hidden" name="next" value={next} />}

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
          autoComplete="email"
          autoFocus
          required
        />
      </Field>

      <SubmitButton />

      <p className="text-sm leading-relaxed text-text-muted">
        CardFlare sign-in is by emailed link — there is no password to remember.
        Accounts are created by invitation during the beta.
      </p>
    </form>
  );
}
