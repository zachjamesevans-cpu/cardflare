"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { describedBy, Field, fieldIds } from "@/components/ui/field";
import { updatePassword } from "@/lib/auth/actions";
import { PASSWORD_MIN } from "@/lib/auth/schema";
import { NEW_PASSWORD_IDLE } from "@/lib/auth/state";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Saving…" : label}
    </Button>
  );
}

/**
 * Choosing a password.
 *
 * Two contexts, one form. An invited store finishing setup has never had a
 * password and is arriving from a link in their invitation; somebody signed in
 * is changing one they already know. The mechanics are identical, so only the
 * words differ.
 */
export function NewPasswordForm({
  signedInAs,
  submitLabel = "Save password",
  savedTitle = "Password saved",
  savedBody,
  continueLabel = "Go to your store",
  continueHref = "/store",
}: {
  signedInAs: string;
  submitLabel?: string;
  savedTitle?: string;
  savedBody?: string;
  continueLabel?: string;
  /** Where "continue" goes — a store's dashboard or a player's account. */
  continueHref?: string;
}) {
  const [state, formAction] = useActionState(updatePassword, NEW_PASSWORD_IDLE);

  const errors = state.status === "error" ? state.fieldErrors : {};

  if (state.status === "saved") {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-4 rounded-[var(--radius-panel)] border border-accent/30 bg-accent/[0.06] px-6 py-10 text-center"
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-accent/15">
          <CheckCircle2 className="size-6 text-accent" aria-hidden="true" />
        </span>
        <h2 className="text-xl font-bold text-text-primary">{savedTitle}</h2>
        <p className="max-w-sm text-pretty text-text-secondary">
          {savedBody ??
            `You can sign in with ${signedInAs} and this password from now on.`}
        </p>
        <Link
          href={continueHref}
          className="text-sm text-accent underline underline-offset-4"
        >
          {continueLabel}
        </Link>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      noValidate
      className="flex flex-col gap-5 rounded-[var(--radius-panel)] border border-border bg-surface p-6 sm:p-8"
    >
      {/*
       * Hidden, and there for password managers rather than for people. A save
       * prompt needs to know which account the password belongs to, and
       * without a username field in the form most managers either skip the
       * prompt or file it under the wrong entry.
       */}
      <input
        type="text"
        name="username"
        value={signedInAs}
        autoComplete="username"
        readOnly
        hidden
      />

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

      <Field
        name="password"
        label="New password"
        hint={`At least ${PASSWORD_MIN} characters. A phrase you can remember beats a short scramble.`}
        error={errors.password}
      >
        <TextInput
          {...fieldIds("password")}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={describedBy("password", Boolean(errors.password), true)}
          autoFocus
          required
        />
      </Field>

      <Field name="confirm" label="Confirm new password" error={errors.confirm}>
        <TextInput
          {...fieldIds("confirm")}
          name="confirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.confirm)}
          aria-describedby={describedBy("confirm", Boolean(errors.confirm), false)}
          required
        />
      </Field>

      <SubmitButton label={submitLabel} />
    </form>
  );
}
