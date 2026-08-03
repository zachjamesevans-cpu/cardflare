"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { describedBy, Field, fieldIds } from "@/components/ui/field";
import { signInWithPassword } from "@/lib/auth/actions";
import { PASSWORD_SIGN_IN_IDLE } from "@/lib/auth/state";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

/**
 * The everyday way in.
 *
 * `autoComplete` is set precisely so password managers offer to fill and to
 * save — that is most of what makes a password less annoying than an emailed
 * link, and getting the attribute wrong quietly removes the benefit.
 */
export function PasswordSignInForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(signInWithPassword, PASSWORD_SIGN_IN_IDLE);

  const errors = state.status === "error" ? state.fieldErrors : {};

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

      <Field name="email" label="Email address" error={errors.email}>
        <TextInput
          {...fieldIds("email")}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          defaultValue={state.status === "error" ? state.email : ""}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={describedBy("email", Boolean(errors.email), false)}
          autoFocus
          required
        />
      </Field>

      <Field name="password" label="Password" error={errors.password}>
        <TextInput
          {...fieldIds("password")}
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={describedBy("password", Boolean(errors.password), false)}
          required
        />
      </Field>

      <SubmitButton />

      <Link
        href="/login/reset"
        className="text-center text-sm text-text-muted underline underline-offset-4 hover:text-text-secondary"
      >
        Forgot your password?
      </Link>
    </form>
  );
}
