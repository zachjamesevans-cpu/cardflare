"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { describedBy, Field, fieldIds } from "@/components/ui/field";
import { signUpWithPassword } from "@/lib/auth/actions";
import { PASSWORD_SIGN_IN_IDLE } from "@/lib/auth/state";
import { PASSWORD_MIN } from "@/lib/auth/signup-schema";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Creating your account…" : "Create my account"}
    </Button>
  );
}

/**
 * The whole ask: an address and a password. Username, picture and games
 * come as their own screens right after, one question at a time -
 * a six-field form at the door is how sign-ups die.
 */
export function SignupForm() {
  const [state, formAction] = useActionState(signUpWithPassword, PASSWORD_SIGN_IN_IDLE);

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
          defaultValue={state.status === "error" ? state.email : ""}
          aria-describedby={describedBy("email", false, false)}
          autoFocus
          required
        />
      </Field>

      <Field
        name="password"
        label="Password"
        hint={`At least ${PASSWORD_MIN} characters. A password manager's suggestion is perfect.`}
      >
        <TextInput
          {...fieldIds("password")}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          aria-describedby={describedBy("password", false, true)}
          required
        />
      </Field>

      <SubmitButton />

      <p className="text-center text-sm text-text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
