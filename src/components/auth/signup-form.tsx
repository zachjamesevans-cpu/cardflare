"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { describedBy, Field, fieldIds } from "@/components/ui/field";
import { checkSignupHandleAction, signUpWithPassword } from "@/lib/auth/actions";
import { PASSWORD_SIGN_IN_IDLE } from "@/lib/auth/state";
import { PASSWORD_MIN } from "@/lib/auth/signup-schema";
import {
  formatHandle,
  HANDLE_MAX,
  HANDLE_MIN,
  handleWhileTyping,
  type HandleAvailability,
} from "@/lib/players/handle";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Creating your account…" : "Create my account"}
    </Button>
  );
}

/** What the availability line under the handle field can be showing. */
type HandleStatus = "idle" | "checking" | HandleAvailability;

/**
 * Watches a handle being typed and asks the server whether it is free.
 *
 * The last answer is held WITH the handle that produced it, and "still
 * checking" is derived by comparing that to what is currently typed —
 * the same shape `ChooseUsernameForm` uses, for the same two reasons:
 * nothing is set synchronously in the effect (a cascading render, and
 * the lint rule says so), and a stale answer landing late cannot be
 * pinned under a fresher handle than the one it was asked about.
 */
function useHandleAvailability(handle: string): HandleStatus {
  const tooShort = handle.length < HANDLE_MIN;

  const [settled, setSettled] = useState<{
    handle: string;
    verdict: HandleAvailability;
  } | null>(null);

  useEffect(() => {
    if (tooShort) return;

    let current = true;
    const timer = setTimeout(() => {
      void checkSignupHandleAction(handle).then((verdict) => {
        if (current) setSettled({ handle, verdict });
      });
    }, 400);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [handle, tooShort]);

  return tooShort ? "idle" : settled?.handle === handle ? settled.verdict : "checking";
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
 * The handle used to write itself from the name. The founder ended
 * that too: "if someone puts in their name, eventually every single
 * username of someone's first name will be taken" — so the field starts
 * empty, is shaped as it is typed, and reports live whether the name is
 * free instead of waiting for the submit button to break the news.
 */
export function SignupForm() {
  const [state, formAction] = useActionState(signUpWithPassword, PASSWORD_SIGN_IN_IDLE);

  const [handle, setHandle] = useState("");
  const availability = useHandleAvailability(handle);

  const availabilityLine =
    availability === "checking"
      ? { tone: "text-text-muted", text: "Checking…" }
      : availability === "available"
        ? { tone: "text-success", text: `${formatHandle(handle)} is available.` }
        : availability === "taken"
          ? { tone: "text-danger", text: "That handle is taken. Try another one." }
          : null;

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
        hint="What people see next to everything you post. Spaces and capitals are fine."
      >
        <TextInput
          {...fieldIds("displayName")}
          name="displayName"
          autoComplete="nickname"
          maxLength={40}
          placeholder="Your name"
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
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={HANDLE_MAX}
            placeholder="your_handle"
            value={handle}
            onChange={(event) => setHandle(handleWhileTyping(event.target.value))}
            aria-describedby={describedBy("handle", false, true)}
            required
          />
        </div>
        {/* Polite so a screen reader hears the verdict without being
            interrupted mid-word on every keystroke. */}
        <p
          aria-live="polite"
          className={`text-sm ${availabilityLine?.tone ?? "sr-only"}`}
        >
          {availabilityLine?.text ?? ""}
        </p>
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
