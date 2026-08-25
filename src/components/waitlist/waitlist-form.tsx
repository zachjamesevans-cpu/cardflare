"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox, Select, Textarea, TextInput } from "@/components/ui/controls";
import { describedBy, Field, fieldIds } from "@/components/ui/field";
import { track } from "@/lib/analytics";
import { submitWaitlist } from "@/lib/waitlist/actions";
import { HONEYPOT_FIELD, RENDERED_AT_FIELD } from "@/lib/waitlist/form-data";
import { userTypeForHash } from "@/lib/waitlist/preselect";
import {
  USER_TYPES,
  valuesFor,
  WAITLIST_IDLE,
  type WaitlistFieldErrors,
  type WaitlistFormState,
} from "@/lib/waitlist/schema";
import { WaitlistSuccess } from "./waitlist-success";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Joining…" : "Join the Waitlist"}
    </Button>
  );
}

function errorFor(state: WaitlistFormState, field: keyof WaitlistFieldErrors) {
  return state.status === "error" ? state.fieldErrors[field] : undefined;
}

export function WaitlistForm() {
  const [state, formAction] = useActionState(submitWaitlist, WAITLIST_IDLE);

  /**
   * Lets the user dismiss a success state without clearing the action result.
   * Storing the dismissed state object (rather than a boolean) means the next
   * submission — a fresh object — shows its confirmation automatically.
   */
  const [dismissed, setDismissed] = useState<WaitlistFormState | null>(null);

  const values = valuesFor(state);

  /*
   * React resets an uncontrolled form once its action resolves, and updating
   * `defaultValue` on already-mounted fields does not survive that reset. Keying
   * the form on the echoed values remounts it so the fields come back populated
   * — otherwise one bad email address would clear everything the user typed.
   */
  const formKey = JSON.stringify(values);

  const startedRef = useRef(false);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const renderedAtRef = useRef<HTMLInputElement>(null);
  const firstRenderedAtRef = useRef<string | null>(null);
  const userTypeRef = useRef<HTMLSelectElement>(null);

  /**
   * The timestamp and the hash preselection are written straight to the DOM
   * rather than held in React state: both are browser-only facts that no
   * rendered output depends on, so putting them in state would only cost a
   * render.
   *
   * The timestamp is captured once and reused, because the form element
   * remounts after a failed submission (see `formKey`). Re-stamping it there
   * would restart the minimum-fill window and flag a quick correction as a bot.
   */
  useEffect(() => {
    firstRenderedAtRef.current ??= String(Date.now());

    if (renderedAtRef.current) {
      renderedAtRef.current.value = firstRenderedAtRef.current;
    }

    function applyHash() {
      const preselected = userTypeForHash(window.location.hash);
      // Only fill an untouched select, so a preselect never overwrites a
      // choice the user already made and we echoed back after an error.
      if (preselected && userTypeRef.current?.value === "") {
        userTypeRef.current.value = preselected;
      }
    }

    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [formKey]);

  useEffect(() => {
    if (state.status === "success") {
      track("waitlist_submitted");
    } else if (state.status === "error") {
      track("waitlist_submission_failed");
      summaryRef.current?.focus();
    }
  }, [state]);

  function handleFirstInteraction() {
    if (startedRef.current) return;
    startedRef.current = true;
    track("waitlist_form_started");
  }

  if (state.status === "success" && state !== dismissed) {
    return (
      <WaitlistSuccess
        alreadyRegistered={state.alreadyRegistered}
        onReset={() => setDismissed(state)}
      />
    );
  }

  const generalError = state.status === "error" ? state.message : undefined;

  return (
    <form
      key={formKey}
      action={formAction}
      onFocus={handleFirstInteraction}
      noValidate
      className="flex flex-col gap-6 rounded-[var(--radius-panel)] border border-border bg-surface p-6 sm:p-8"
    >
      {/*
       * Honeypot. Hidden from sight and from assistive technology, and excluded
       * from the tab order, so only a script that fills every field trips it.
       */}
      <div aria-hidden="true" className="absolute h-px w-px overflow-hidden opacity-0">
        <label htmlFor={HONEYPOT_FIELD}>Company website</label>
        <input
          id={HONEYPOT_FIELD}
          name={HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <input ref={renderedAtRef} type="hidden" name={RENDERED_AT_FIELD} />

      <p
        ref={summaryRef}
        tabIndex={-1}
        role="alert"
        className={
          generalError
            ? "rounded-[var(--radius-control)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
            : "sr-only"
        }
      >
        {generalError ?? ""}
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="firstName" label="First name" error={errorFor(state, "firstName")}>
          <TextInput
            {...fieldIds("firstName")}
            name="firstName"
            defaultValue={values.firstName}
            autoComplete="given-name"
            required
            aria-invalid={errorFor(state, "firstName") ? true : undefined}
            aria-describedby={describedBy(
              "firstName",
              !!errorFor(state, "firstName"),
              false,
            )}
          />
        </Field>

        <Field name="email" label="Email address" error={errorFor(state, "email")}>
          <TextInput
            {...fieldIds("email")}
            name="email"
            defaultValue={values.email}
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            aria-invalid={errorFor(state, "email") ? true : undefined}
            aria-describedby={describedBy("email", !!errorFor(state, "email"), false)}
          />
        </Field>
      </div>

      <Field
        name="userType"
        label="Which best describes you?"
        error={errorFor(state, "userType")}
      >
        <Select
          {...fieldIds("userType")}
          name="userType"
          required
          ref={userTypeRef}
          defaultValue={values.userType}
          aria-invalid={errorFor(state, "userType") ? true : undefined}
          aria-describedby={describedBy(
            "userType",
            !!errorFor(state, "userType"),
            false,
          )}
        >
          <option value="" disabled>
            Select an option
          </option>
          {USER_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset className="flex flex-col gap-5 border-t border-border pt-6">
        <legend className="text-sm font-semibold text-text-muted">
          Optional. It helps us plan the first pilots
        </legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="primaryGame" label="Primary card game" optional>
            <TextInput
              {...fieldIds("primaryGame")}
              name="primaryGame"
              defaultValue={values.primaryGame}
              placeholder="One Piece Card Game"
            />
          </Field>

          <Field name="storeName" label="Local game store" optional>
            <TextInput
              {...fieldIds("storeName")}
              name="storeName"
              defaultValue={values.storeName}
            />
          </Field>

          <Field name="city" label="City" optional>
            <TextInput
              {...fieldIds("city")}
              name="city"
              defaultValue={values.city}
              autoComplete="address-level2"
            />
          </Field>

          <Field name="region" label="State or region" optional>
            <TextInput
              {...fieldIds("region")}
              name="region"
              defaultValue={values.region}
              autoComplete="address-level1"
            />
          </Field>
        </div>

        <Field
          name="comment"
          label="Anything you want us to know?"
          optional
          error={errorFor(state, "comment")}
        >
          <Textarea
            {...fieldIds("comment")}
            name="comment"
            defaultValue={values.comment}
            maxLength={500}
            aria-invalid={errorFor(state, "comment") ? true : undefined}
            aria-describedby={describedBy(
              "comment",
              !!errorFor(state, "comment"),
              false,
            )}
          />
        </Field>
      </fieldset>

      {/*
       * Optional. Launch news is sent regardless — that is what joining the
       * list asks for — so this covers the wider updates only, and carries no
       * error state because there is no wrong answer.
       */}
      <Checkbox
        id="marketingConsent"
        name="marketingConsent"
        label={
          <>
            Optional: also email me cardflare news, event announcements and trading
            tips. We will not sell your information, and you can unsubscribe from any
            email.
          </>
        }
      />

      <SubmitButton />
    </form>
  );
}
