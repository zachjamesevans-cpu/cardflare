"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea, TextInput } from "@/components/ui/controls";
import { describedBy, Field, fieldIds } from "@/components/ui/field";
import { submitContact } from "@/lib/contact/actions";
import {
  CONTACT_IDLE,
  HONEYPOT_FIELD,
  MESSAGE_MAX,
  RENDERED_AT_FIELD,
  type ContactFieldErrors,
  type ContactState,
} from "@/lib/contact/schema";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Sending…" : "Send message"}
    </Button>
  );
}

function errorFor(state: ContactState, field: keyof ContactFieldErrors) {
  return state.status === "error" ? state.fieldErrors[field] : undefined;
}

const EMPTY = { name: "", email: "", subject: "", message: "" };

export function ContactForm() {
  const [state, formAction] = useActionState(submitContact, CONTACT_IDLE);

  const values = state.status === "error" ? state.values : EMPTY;

  /*
   * React resets an uncontrolled form once its action resolves, and a
   * changed `defaultValue` does not survive that reset. Keying the form
   * on the echoed values remounts it so the fields come back populated —
   * the waitlist form's lesson, and it matters more here: losing a long
   * typed message to one bad email address would be infuriating.
   */
  const formKey = JSON.stringify(values);

  const summaryRef = useRef<HTMLParagraphElement>(null);
  const renderedAtRef = useRef<HTMLInputElement>(null);
  const firstRenderedAtRef = useRef<string | null>(null);

  /*
   * Captured once and reused: the form remounts after a failed
   * submission, and re-stamping would restart the minimum-fill window
   * and flag a quick correction as a bot.
   */
  useEffect(() => {
    firstRenderedAtRef.current ??= String(Date.now());
    if (renderedAtRef.current) {
      renderedAtRef.current.value = firstRenderedAtRef.current;
    }
  }, [formKey]);

  useEffect(() => {
    if (state.status === "error") summaryRef.current?.focus();
  }, [state]);

  if (state.status === "sent") {
    return (
      <Card className="flex items-start gap-3 border-accent/30 bg-accent/[0.06]">
        <CheckCircle2
          className="mt-0.5 size-5 shrink-0 text-accent"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-text-primary">Message sent</p>
          <p className="text-sm text-text-secondary">
            Thanks for writing. We read everything that comes in and will reply to the
            address you gave us.
          </p>
        </div>
      </Card>
    );
  }

  const generalError = state.status === "error" ? state.message : undefined;

  return (
    <Card>
      <form key={formKey} action={formAction} className="flex flex-col gap-5">
        {generalError && (
          <p
            ref={summaryRef}
            tabIndex={-1}
            role="alert"
            className="rounded-[var(--radius-control)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
          >
            {generalError}
          </p>
        )}

        <Field name="name" label="Your name" error={errorFor(state, "name")}>
          <TextInput
            {...fieldIds("name")}
            name="name"
            autoComplete="name"
            defaultValue={values.name}
            aria-invalid={errorFor(state, "name") ? true : undefined}
            aria-describedby={describedBy("name", !!errorFor(state, "name"), false)}
          />
        </Field>

        <Field
          name="email"
          label="Your email"
          hint="So we can reply."
          error={errorFor(state, "email")}
        >
          <TextInput
            {...fieldIds("email")}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            defaultValue={values.email}
            aria-invalid={errorFor(state, "email") ? true : undefined}
            aria-describedby={describedBy("email", !!errorFor(state, "email"), true)}
          />
        </Field>

        <Field
          name="subject"
          label="Subject"
          optional
          error={errorFor(state, "subject")}
        >
          <TextInput
            {...fieldIds("subject")}
            name="subject"
            defaultValue={values.subject}
            aria-invalid={errorFor(state, "subject") ? true : undefined}
            aria-describedby={describedBy(
              "subject",
              !!errorFor(state, "subject"),
              false,
            )}
          />
        </Field>

        <Field name="message" label="Message" error={errorFor(state, "message")}>
          <Textarea
            {...fieldIds("message")}
            name="message"
            rows={6}
            maxLength={MESSAGE_MAX}
            defaultValue={values.message}
            aria-invalid={errorFor(state, "message") ? true : undefined}
            aria-describedby={describedBy(
              "message",
              !!errorFor(state, "message"),
              false,
            )}
          />
        </Field>

        {/*
         * Anti-spam, both invisible to a person: a field no human sees,
         * and the moment the form appeared. Hidden with a class rather
         * than `type="hidden"` so a bot filling visible-looking inputs
         * still trips it.
         */}
        <div aria-hidden="true" className="hidden">
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

        <div>
          <SubmitButton />
        </div>
      </form>
    </Card>
  );
}
