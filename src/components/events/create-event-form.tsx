"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, TextInput } from "@/components/ui/controls";
import { describedBy, Field, fieldIds } from "@/components/ui/field";
import { createEventAction } from "@/lib/events/actions";
import {
  CREATE_EVENT_IDLE,
  EVENT_NAME_MAX,
  type CreateEventFieldErrors,
  type CreateEventState,
} from "@/lib/events/schema";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Creating…" : "Create event"}
    </Button>
  );
}

function errorFor(state: CreateEventState, field: keyof CreateEventFieldErrors) {
  return state.status === "error" ? state.fieldErrors[field] : undefined;
}

export interface StoreOption {
  id: string;
  name: string;
}

/**
 * Creates an event for one store.
 *
 * A store member has exactly one store, so it is a hidden field. An admin may
 * create for any of them, so they get a picker — the server re-checks the
 * choice against the caller's membership either way, so the difference here is
 * only what is worth showing.
 */
export function CreateEventForm({
  storeId,
  stores,
  defaultStartsAt,
  defaultEndsAt,
}: {
  /** Fixed store, for a store member. */
  storeId?: string;
  /** Choosable stores, for an admin. Exactly one of these two is given. */
  stores?: StoreOption[];
  /** Pre-filled with a sensible next slot, computed on the server. */
  defaultStartsAt: string;
  defaultEndsAt: string;
}) {
  const [state, formAction] = useActionState<CreateEventState, FormData>(
    createEventAction,
    CREATE_EVENT_IDLE,
  );

  const values = state.status === "error" ? state.values : undefined;

  return (
    <form
      key={JSON.stringify(state)}
      action={formAction}
      noValidate
      className="flex flex-col gap-5"
    >
      {storeId && <input type="hidden" name="storeId" value={storeId} />}

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

      {stores && (
        <Field name="storeId" label="Store" error={errorFor(state, "storeId")}>
          <Select
            {...fieldIds("storeId")}
            name="storeId"
            required
            defaultValue={stores.length === 1 ? stores[0].id : ""}
            aria-invalid={errorFor(state, "storeId") ? true : undefined}
            aria-describedby={describedBy(
              "storeId",
              !!errorFor(state, "storeId"),
              false,
            )}
          >
            <option value="" disabled>
              Choose a store…
            </option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field
        name="name"
        label="Event name"
        hint="What players will see when they scan in."
        error={errorFor(state, "name")}
      >
        <TextInput
          {...fieldIds("name")}
          name="name"
          required
          maxLength={EVENT_NAME_MAX}
          defaultValue={values?.name ?? ""}
          placeholder="Friday Night One Piece"
          aria-invalid={errorFor(state, "name") ? true : undefined}
          aria-describedby={describedBy("name", !!errorFor(state, "name"), true)}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="startsAt" label="Starts" error={errorFor(state, "startsAt")}>
          <TextInput
            {...fieldIds("startsAt")}
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={values?.startsAt ?? defaultStartsAt}
            aria-invalid={errorFor(state, "startsAt") ? true : undefined}
            aria-describedby={describedBy(
              "startsAt",
              !!errorFor(state, "startsAt"),
              false,
            )}
          />
        </Field>

        <Field name="endsAt" label="Ends" error={errorFor(state, "endsAt")}>
          <TextInput
            {...fieldIds("endsAt")}
            name="endsAt"
            type="datetime-local"
            required
            defaultValue={values?.endsAt ?? defaultEndsAt}
            aria-invalid={errorFor(state, "endsAt") ? true : undefined}
            aria-describedby={describedBy("endsAt", !!errorFor(state, "endsAt"), false)}
          />
        </Field>
      </div>

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
