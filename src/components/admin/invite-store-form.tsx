"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, MailCheck, MailWarning } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { describedBy, Field, fieldIds } from "@/components/ui/field";
import { inviteStoreAction } from "@/lib/stores/actions";
import {
  INVITE_STORE_IDLE,
  type InviteStoreFieldErrors,
  type InviteStoreState,
} from "@/lib/stores/schema";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Inviting…" : "Invite store"}
    </Button>
  );
}

function errorFor(state: InviteStoreState, field: keyof InviteStoreFieldErrors) {
  return state.status === "error" ? state.fieldErrors[field] : undefined;
}

export function InviteStoreForm() {
  const [state, formAction] = useActionState(inviteStoreAction, INVITE_STORE_IDLE);

  // As with the waitlist form, React resets an uncontrolled form once the
  // action resolves. Keying it on the outcome remounts it, which both clears
  // the fields after a success and is harmless after a failure.
  const formKey = JSON.stringify(state);

  return (
    <div className="flex flex-col gap-4">
      {state.status === "success" && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-[var(--radius-control)] border border-accent/30 bg-accent/[0.07] px-4 py-3 text-sm text-text-secondary"
        >
          {state.emailSent ? (
            <MailCheck
              className="mt-0.5 size-4 shrink-0 text-accent"
              aria-hidden="true"
            />
          ) : (
            <MailWarning
              className="mt-0.5 size-4 shrink-0 text-warning"
              aria-hidden="true"
            />
          )}
          <span>
            <strong className="font-semibold text-text-primary">
              {state.storeName}
            </strong>{" "}
            {state.emailSent
              ? "was invited and the email is on its way."
              : "was invited, but the email did not send. They can still sign in — pass the link on yourself."}
          </span>
        </p>
      )}

      <form
        key={formKey}
        action={formAction}
        noValidate
        className="flex flex-col gap-5"
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

        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="name" label="Store name" error={errorFor(state, "name")}>
            <TextInput
              {...fieldIds("name")}
              name="name"
              required
              placeholder="Grand Line Games"
              aria-invalid={errorFor(state, "name") ? true : undefined}
              aria-describedby={describedBy("name", !!errorFor(state, "name"), false)}
            />
          </Field>

          <Field
            name="contactEmail"
            label="Contact email"
            hint="They sign in with this address."
            error={errorFor(state, "contactEmail")}
          >
            <TextInput
              {...fieldIds("contactEmail")}
              name="contactEmail"
              type="email"
              inputMode="email"
              required
              aria-invalid={errorFor(state, "contactEmail") ? true : undefined}
              aria-describedby={describedBy(
                "contactEmail",
                !!errorFor(state, "contactEmail"),
                true,
              )}
            />
          </Field>

          <Field name="city" label="City" optional error={errorFor(state, "city")}>
            <TextInput {...fieldIds("city")} name="city" />
          </Field>

          <Field
            name="region"
            label="State or region"
            optional
            error={errorFor(state, "region")}
          >
            <TextInput {...fieldIds("region")} name="region" />
          </Field>
        </div>

        <div>
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
