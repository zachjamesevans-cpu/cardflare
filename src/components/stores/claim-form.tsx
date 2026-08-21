"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput, Textarea } from "@/components/ui/controls";
import { submitClaimAction } from "@/lib/stores/claim-actions";
import {
  CLAIM_IDLE,
  CLAIM_NOTES_LIMIT,
  CLAIM_ROLES,
  type ClaimState,
} from "@/lib/stores/claim-schema";

/**
 * The claim form.
 *
 * Five fields, two of them required, and every one answerable from
 * memory at a counter. Anything needing paperwork belongs in the email
 * an admin sends, not in the form that decides whether somebody bothers
 * at all.
 *
 * Errors are drawn against the field they belong to rather than piled
 * into one line at the top, and what was typed comes back on a
 * rejection — the difference between a form somebody fixes and a form
 * somebody abandons.
 */
function SendButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sending…" : "Send this claim"}
    </Button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p className="text-xs text-danger" role="alert">
      {message}
    </p>
  );
}

export function ClaimForm({
  storeId,
  storeName,
}: {
  storeId: string;
  storeName: string;
}) {
  const [state, action] = useActionState<ClaimState, FormData>(
    submitClaimAction,
    CLAIM_IDLE,
  );

  if (state.status === "sent") {
    return (
      <div
        className="flex flex-col gap-2 rounded-lg border border-border-strong bg-elevated p-4"
        role="status"
      >
        <p className="flex items-center gap-2 font-semibold text-text-primary">
          <CheckCircle2 className="size-5 shrink-0 text-accent" aria-hidden="true" />
          We have your claim
        </p>
        <p className="text-sm text-text-secondary">
          Someone will email {state.fields.claimantEmail} about {storeName}. Nothing on
          the listing has changed yet.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="storeId" value={storeId} readOnly />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-primary">Your name</span>
        <TextInput
          name="claimantName"
          defaultValue={state.fields.claimantName}
          autoComplete="name"
          required
          aria-invalid={Boolean(state.errors.claimantName)}
        />
        <FieldError message={state.errors.claimantName} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-primary">Your email</span>
        <TextInput
          name="claimantEmail"
          type="email"
          defaultValue={state.fields.claimantEmail}
          autoComplete="email"
          required
          aria-invalid={Boolean(state.errors.claimantEmail)}
        />
        <span className="text-xs text-text-muted">Where we&rsquo;ll reply.</span>
        <FieldError message={state.errors.claimantEmail} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-primary">Your role there</span>
        <select
          name="claimantRole"
          defaultValue={state.fields.claimantRole || CLAIM_ROLES[0]}
          className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-text-primary"
        >
          {CLAIM_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-primary">
          Store email <span className="font-normal text-text-muted">(optional)</span>
        </span>
        <TextInput
          name="businessEmail"
          type="email"
          defaultValue={state.fields.businessEmail}
          aria-invalid={Boolean(state.errors.businessEmail)}
        />
        {/* Explained rather than demanded: plenty of small shops run on a
            personal address, and saying so is the honest answer. */}
        <span className="text-xs text-text-muted">
          An address at the shop&rsquo;s own domain is the fastest way for us to confirm
          this. A personal one is fine too.
        </span>
        <FieldError message={state.errors.businessEmail} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-primary">
          Anything else <span className="font-normal text-text-muted">(optional)</span>
        </span>
        <Textarea
          name="notes"
          defaultValue={state.fields.notes}
          maxLength={CLAIM_NOTES_LIMIT}
          aria-invalid={Boolean(state.errors.notes)}
        />
        <FieldError message={state.errors.notes} />
      </label>

      {state.message && (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      )}

      <SendButton />
    </form>
  );
}
