"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, MailCheck, MailWarning, MailX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { describedBy, Field, fieldIds } from "@/components/ui/field";
import { inviteStoreAction } from "@/lib/stores/actions";
import {
  INVITE_STORE_IDLE,
  type InviteEmailOutcome,
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

/**
 * Reports what happened, distinguishing the two ways an email can not arrive.
 *
 * "Email is not set up yet" is a configuration task; "the provider rejected
 * it" is a fault to investigate. Both leave the store perfectly usable, so
 * neither is framed as a failure of the invitation itself.
 */
function InviteOutcome({
  storeName,
  email,
  setupLink,
}: {
  storeName: string;
  email: InviteEmailOutcome;
  setupLink?: string | null;
}) {
  const { Icon, tone, message } = {
    sent: {
      Icon: MailCheck,
      tone: "text-accent",
      message: "was invited, and the email is on its way.",
    },
    "not-configured": {
      Icon: MailWarning,
      tone: "text-warning",
      /*
       * This used to say "tell them to sign in", which they cannot do: an
       * invited account has no password yet, so a sign-in form is a dead end.
       */
      message:
        "was invited, but no email was sent because email is not configured yet. Send them the setup link below, or tell them to request one at cardflare.gg/login/reset.",
    },
    failed: {
      Icon: MailX,
      tone: "text-danger",
      message:
        "was invited, but the email provider rejected the message. Check the runtime logs, then send them the setup link below.",
    },
  }[email];

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-accent/30 bg-accent/[0.07] px-4 py-3 text-sm text-text-secondary"
    >
      <p className="flex items-start gap-2">
        <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden="true" />
        <span>
          <strong className="font-semibold text-text-primary">{storeName}</strong>{" "}
          {message}
        </span>
      </p>

      {/*
       * Shown only when nothing was delivered. This link signs its holder in
       * as that store, so it is a credential — there is no reason to put it on
       * screen when the store already has it in their inbox.
       */}
      {setupLink && (
        <div className="flex flex-col gap-1.5 border-t border-accent/20 pt-3">
          <p className="text-xs text-text-muted">
            Send them this. It signs them in once, then expires.
          </p>
          <code className="block max-w-full overflow-x-auto rounded-[var(--radius-control)] border border-border bg-canvas px-3 py-2 font-mono text-xs break-all text-text-primary">
            {setupLink}
          </code>
        </div>
      )}
    </div>
  );
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
        <InviteOutcome
          storeName={state.storeName}
          email={state.email}
          setupLink={state.setupLink}
        />
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
