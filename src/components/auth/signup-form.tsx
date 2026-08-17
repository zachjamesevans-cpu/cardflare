"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { describedBy, Field, fieldIds } from "@/components/ui/field";
import { signUpWithPassword } from "@/lib/auth/actions";
import { PASSWORD_SIGN_IN_IDLE } from "@/lib/auth/state";
import { PASSWORD_MIN } from "@/lib/auth/signup-schema";
import { HANDLE_MAX, handleSeedFrom } from "@/lib/players/handle";

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
 * Everything an account is, asked once.
 *
 * It used to be an address and a password, with the name and handle on a
 * screen after — reached by a LINK from a success message. The founder
 * walked his own sign-up and named it: "it had me put in my name, set a
 * password, then there was a separate link to choose my username. this
 * should all be on one page."
 *
 * The old reasoning was that a short form at the door converts better.
 * That is true of a short form; it was not true of what this actually
 * was, which is the same questions with a door in the middle. Four
 * fields, one button, and the optional picture is the only thing left
 * after.
 *
 * The handle writes itself from the name until it is touched by hand,
 * exactly as it does in the setup flow this replaces.
 */
export function SignupForm() {
  const [state, formAction] = useActionState(signUpWithPassword, PASSWORD_SIGN_IN_IDLE);

  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  /** Once they have edited it themselves, the name stops driving it. */
  const [handleOwned, setHandleOwned] = useState(false);

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

      <Field
        name="displayName"
        label="Your name"
        hint="What people see when you walk into a room. Spaces and capitals are fine."
      >
        <TextInput
          {...fieldIds("displayName")}
          name="displayName"
          autoComplete="nickname"
          maxLength={40}
          placeholder="Steven B"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!handleOwned) setHandle(handleSeedFrom(event.target.value));
          }}
          aria-describedby={describedBy("displayName", false, true)}
          required
        />
      </Field>

      <Field
        name="handle"
        label="Your handle"
        hint="How people look you up. Letters, numbers and underscores only."
      >
        {/* The at-sign sits inside the field so this input keeps the same
            left edge as the three above it. */}
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
          >
            @
          </span>
          <TextInput
            {...fieldIds("handle")}
            name="handle"
            className="w-full pl-7"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={HANDLE_MAX}
            placeholder="steven_b"
            value={handle}
            onChange={(event) => {
              setHandleOwned(true);
              /* Typed straight into shape, so the field never shows
                 something the server is about to refuse. */
              setHandle(handleSeedFrom(event.target.value));
            }}
            aria-describedby={describedBy("handle", false, true)}
            required
          />
        </div>
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
