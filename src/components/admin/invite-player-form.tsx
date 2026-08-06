"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, MailCheck, MailWarning, MailX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { Field, fieldIds } from "@/components/ui/field";
import { invitePlayerAction } from "@/lib/players/account-actions";
import {
  INVITE_PLAYER_IDLE,
  type InvitePlayerState,
} from "@/lib/players/account-schema";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Inviting…" : "Invite player"}
    </Button>
  );
}

function Outcome({ state }: { state: InvitePlayerState & { status: "success" } }) {
  const { Icon, tone, message } = {
    sent: {
      Icon: MailCheck,
      tone: "text-accent",
      message: "was invited, and the email is on its way.",
    },
    "not-configured": {
      Icon: MailWarning,
      tone: "text-warning",
      message:
        "was invited, but no email was sent because email is not configured yet. Send them the setup link below.",
    },
    failed: {
      Icon: MailX,
      tone: "text-danger",
      message:
        "was invited, but the email provider rejected the message. Send them the setup link below.",
    },
  }[state.email];

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-accent/30 bg-accent/[0.07] px-4 py-3 text-sm text-text-secondary"
    >
      <p className="flex items-start gap-2">
        <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden="true" />
        <span>
          <strong className="font-semibold text-text-primary">
            {state.displayName}
          </strong>{" "}
          {message}
        </span>
      </p>

      {state.setupLink && (
        <div className="flex flex-col gap-1.5 border-t border-accent/20 pt-3">
          <p className="text-xs text-text-muted">
            Send them this. It signs them in once, then expires.
          </p>
          <code className="block max-w-full overflow-x-auto rounded-[var(--radius-control)] border border-border bg-canvas px-3 py-2 font-mono text-xs break-all text-text-primary">
            {state.setupLink}
          </code>
        </div>
      )}
    </div>
  );
}

export function InvitePlayerForm() {
  const [state, formAction] = useActionState(invitePlayerAction, INVITE_PLAYER_IDLE);
  const formKey = JSON.stringify(state);

  return (
    <div className="flex flex-col gap-4">
      {state.status === "success" && <Outcome state={state} />}

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
          <Field name="displayName" label="Display name">
            <TextInput
              {...fieldIds("displayName")}
              name="displayName"
              required
              placeholder="Kaito"
            />
          </Field>

          <Field name="email" label="Email" hint="They sign in with this address.">
            <TextInput
              {...fieldIds("email")}
              name="email"
              type="email"
              inputMode="email"
              required
            />
          </Field>
        </div>

        <div>
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
