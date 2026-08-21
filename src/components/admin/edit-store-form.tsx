"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { Field, fieldIds } from "@/components/ui/field";
import { updateSignInEmailAction, updateStoreAction } from "@/lib/admin/record-actions";
import { RECORD_EDIT_IDLE, type RecordEditState } from "@/lib/admin/record-schema";

/**
 * Editing a store in place, so a rename costs nothing else.
 *
 * The alternative an admin had was a fresh invitation, which mints a new
 * store with a new counter code and leaves the singles they already
 * uploaded attached to the old one. Everything here edits the record the
 * store already owns: same id, same code, same inventory, same history.
 */

function SaveButton({ label = "Save changes" }: { label?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Saving…" : label}
    </Button>
  );
}

function Outcome({ state }: { state: RecordEditState }) {
  if (state.status === "idle") return null;

  const isError = state.status === "error";

  return (
    <p
      role="status"
      className={
        isError
          ? "flex items-start gap-2 rounded-[var(--radius-control)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
          : "flex items-start gap-2 rounded-[var(--radius-control)] border border-accent/30 bg-accent/[0.07] px-4 py-3 text-sm text-text-secondary"
      }
    >
      {isError ? (
        <X className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : (
        <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
      )}
      {state.message}
    </p>
  );
}

export function EditStoreForm({
  store,
}: {
  store: {
    id: string;
    name: string;
    /** Null for an unclaimed listing nobody has given one. */
    contactEmail: string | null;
    city: string | null;
    region: string | null;
    addressLine: string | null;
    postalCode: string | null;
    country: string | null;
    phone: string | null;
    website: string | null;
  };
}) {
  const [state, formAction] = useActionState(updateStoreAction, RECORD_EDIT_IDLE);

  return (
    <div className="flex flex-col gap-4">
      <Outcome state={state} />

      <form action={formAction} noValidate className="flex flex-col gap-5">
        <input type="hidden" name="storeId" value={store.id} />

        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="name" label="Store name">
            <TextInput
              {...fieldIds("name")}
              name="name"
              required
              defaultValue={store.name}
            />
          </Field>

          <Field
            name="contactEmail"
            label="Contact email"
            hint="Where CardFlare writes. Not their sign-in address."
          >
            <TextInput
              {...fieldIds("contactEmail")}
              name="contactEmail"
              type="email"
              inputMode="email"
              required
              defaultValue={store.contactEmail ?? ""}
            />
          </Field>

          <Field name="city" label="City">
            <TextInput
              {...fieldIds("city")}
              name="city"
              defaultValue={store.city ?? ""}
            />
          </Field>

          <Field name="region" label="Region">
            <TextInput
              {...fieldIds("region")}
              name="region"
              defaultValue={store.region ?? ""}
            />
          </Field>

          {/*
           * The directory fields. A discovered listing arrives with an
           * address and no contact email; this is where it gets one, and
           * where anything the provider had wrong gets corrected.
           */}
          <Field name="addressLine" label="Street address">
            <TextInput
              {...fieldIds("addressLine")}
              name="addressLine"
              defaultValue={store.addressLine ?? ""}
            />
          </Field>

          <Field name="postalCode" label="Postal code">
            <TextInput
              {...fieldIds("postalCode")}
              name="postalCode"
              defaultValue={store.postalCode ?? ""}
            />
          </Field>

          <Field name="country" label="Country">
            <TextInput
              {...fieldIds("country")}
              name="country"
              defaultValue={store.country ?? ""}
            />
          </Field>

          <Field name="phone" label="Phone">
            <TextInput
              {...fieldIds("phone")}
              name="phone"
              defaultValue={store.phone ?? ""}
            />
          </Field>

          <Field name="website" label="Website">
            <TextInput
              {...fieldIds("website")}
              name="website"
              defaultValue={store.website ?? ""}
            />
          </Field>
        </div>

        <div>
          <SaveButton />
        </div>
      </form>
    </div>
  );
}

/**
 * The other kind of email: the credential.
 *
 * Separated from the details form on purpose — changing where CardFlare
 * writes is bookkeeping, and changing what somebody types to sign in is
 * account surgery. Confirmed immediately, so the store can use the new
 * address straight away without chasing a link.
 */
export function EditSignInEmailForm({
  userId,
  email,
  storeId,
  playerId,
}: {
  userId: string;
  email: string | null;
  /** One of these scopes the change; the action verifies the link. */
  storeId?: string;
  playerId?: string;
}) {
  const [state, formAction] = useActionState(updateSignInEmailAction, RECORD_EDIT_IDLE);

  return (
    <div className="flex flex-col gap-3">
      <Outcome state={state} />

      <form action={formAction} noValidate className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="userId" value={userId} />
        {storeId && <input type="hidden" name="storeId" value={storeId} />}
        {playerId && <input type="hidden" name="playerId" value={playerId} />}

        <div className="min-w-56 flex-1">
          <Field name={`email-${userId}`} label="Sign-in email">
            <TextInput
              {...fieldIds(`email-${userId}`)}
              name="email"
              type="email"
              inputMode="email"
              required
              defaultValue={email ?? ""}
            />
          </Field>
        </div>

        <SaveButton label="Change sign-in" />
      </form>
    </div>
  );
}
