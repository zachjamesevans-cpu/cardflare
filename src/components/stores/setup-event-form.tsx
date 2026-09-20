"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CalendarCheck } from "lucide-react";

import { TextInput } from "@/components/ui/controls";
import { describedBy, Field, fieldIds } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { createEventInPlaceAction, type CreateEventResult } from "@/lib/events/actions";
import {
  CREATE_EVENT_IDLE,
  EVENT_NAME_MAX,
  type CreateEventFieldErrors,
} from "@/lib/events/schema";

/**
 * The wizard's event form: the Events tab's action without the redirect.
 *
 * Creating a night from the console lands you on that night's page,
 * which is right there and wrong here - the wizard has two steps left.
 * So the same fields post the same action in its in-place mode, which
 * reports the night back, and the step shows it under the form with a
 * way to that page for later.
 */
export function SetupEventForm({
  storeId,
  defaultStartsAt,
  defaultEndsAt,
  another,
}: {
  storeId: string;
  /** Pre-filled with the next whole hour in the store's zone, from the server. */
  defaultStartsAt: string;
  defaultEndsAt: string;
  /** Whether the store already has a night; changes the button's words. */
  another: boolean;
}) {
  const [state, action] = useActionState<CreateEventResult, FormData>(
    createEventInPlaceAction,
    CREATE_EVENT_IDLE,
  );
  const values = state.status === "error" ? state.values : undefined;
  const errorFor = (field: keyof CreateEventFieldErrors) =>
    state.status === "error" ? state.fieldErrors[field] : undefined;

  if (state.status === "created") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-accent/40 bg-accent/10 p-4">
        <p className="flex items-center gap-2 font-semibold text-text-primary">
          <CalendarCheck className="size-5 text-accent" aria-hidden="true" />
          {state.name} is on the calendar.
        </p>
        <p className="text-sm text-text-secondary">
          Your counter code opens its room while it runs, so the sign on the counter
          already points at it. Nothing else to print.
        </p>
        <Link
          href={`/store/events/${state.eventId}?as=${storeId}`}
          className="text-sm font-semibold text-accent underline-offset-4 hover:underline"
        >
          Open the event
        </Link>
      </div>
    );
  }

  return (
    <form
      key={JSON.stringify(values)}
      action={action}
      noValidate
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="storeId" value={storeId} />

      {state.status === "error" && (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {state.message}
        </p>
      )}

      <Field
        name="name"
        label="Event name"
        hint="What players see when they scan in."
        error={errorFor("name")}
      >
        <TextInput
          {...fieldIds("name")}
          name="name"
          required
          maxLength={EVENT_NAME_MAX}
          defaultValue={values?.name ?? ""}
          placeholder="Friday Night One Piece"
          aria-invalid={errorFor("name") ? true : undefined}
          aria-describedby={describedBy("name", !!errorFor("name"), true)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="startsAt" label="Starts" error={errorFor("startsAt")}>
          <TextInput
            {...fieldIds("startsAt")}
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={values?.startsAt ?? defaultStartsAt}
            aria-invalid={errorFor("startsAt") ? true : undefined}
            aria-describedby={describedBy("startsAt", !!errorFor("startsAt"), false)}
          />
        </Field>
        <Field name="endsAt" label="Ends" error={errorFor("endsAt")}>
          <TextInput
            {...fieldIds("endsAt")}
            name="endsAt"
            type="datetime-local"
            required
            defaultValue={values?.endsAt ?? defaultEndsAt}
            aria-invalid={errorFor("endsAt") ? true : undefined}
            aria-describedby={describedBy("endsAt", !!errorFor("endsAt"), false)}
          />
        </Field>
      </div>

      <label className="flex items-start gap-3 text-sm text-text-secondary">
        <input
          type="checkbox"
          name="repeatWeekly"
          defaultChecked={values?.repeatWeekly ?? false}
          className="mt-0.5 size-4 accent-accent"
        />
        <span>
          <span className="font-medium text-text-primary">Repeats weekly.</span> When
          this one closes, next week&rsquo;s appears by itself.
        </span>
      </label>

      <div>
        <SubmitButton
          label={another ? "Add another event" : "Create the event"}
          pendingLabel="Creating…"
        />
      </div>
    </form>
  );
}
