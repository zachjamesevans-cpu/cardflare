"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { describedBy, Field, fieldIds } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { cancelEventAction, updateEventAction } from "@/lib/events/actions";
import {
  CREATE_EVENT_IDLE,
  EVENT_NAME_MAX,
  type CreateEventFieldErrors,
  type CreateEventState,
  type CreateEventValues,
} from "@/lib/events/schema";

/**
 * The form's own view of the action: the action reports `idle` on
 * success, which is also where the form starts, so a save is recorded
 * here as its own state and "Saved." can be said once.
 */
type EditState = CreateEventState | { status: "saved" };

/**
 * Changes a night's name and window, from its page.
 *
 * The audit made a night with the wrong time and had no way to fix it
 * short of making another. Same fields as creating one, prefilled from
 * the row in the store's zone (the page converts the instants), and the
 * same action shape underneath.
 */
export function EditEventForm({
  eventId,
  values,
}: {
  eventId: string;
  /** The night as it is, with its times already in the store's zone. */
  values: CreateEventValues;
}) {
  const [state, formAction] = useActionState<EditState, FormData>(
    async (_previous, formData) => {
      const next = await updateEventAction(CREATE_EVENT_IDLE, formData);
      return next.status === "idle" ? { status: "saved" } : next;
    },
    CREATE_EVENT_IDLE,
  );

  const current = state.status === "error" ? state.values : values;
  const errorFor = (field: keyof CreateEventFieldErrors) =>
    state.status === "error" ? state.fieldErrors[field] : undefined;

  return (
    <form
      /* Remount on a failed submit so the inputs show the values that
         came back, not whatever was typed after. */
      key={state.status === "error" ? JSON.stringify(state.values) : "clean"}
      action={formAction}
      noValidate
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="eventId" value={eventId} />

      {state.status === "error" && (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {state.message}
        </p>
      )}

      {state.status === "saved" && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm font-semibold text-accent"
        >
          <Check className="size-4" aria-hidden="true" />
          Saved.
        </p>
      )}

      <Field name="name" label="Name" error={errorFor("name")}>
        <TextInput
          {...fieldIds("name")}
          name="name"
          required
          maxLength={EVENT_NAME_MAX}
          defaultValue={current.name}
          aria-invalid={errorFor("name") ? true : undefined}
          aria-describedby={describedBy("name", !!errorFor("name"), false)}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="startsAt" label="Starts" error={errorFor("startsAt")}>
          <TextInput
            {...fieldIds("startsAt")}
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={current.startsAt}
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
            defaultValue={current.endsAt}
            aria-invalid={errorFor("endsAt") ? true : undefined}
            aria-describedby={describedBy("endsAt", !!errorFor("endsAt"), false)}
          />
        </Field>
      </div>

      <label className="flex items-start gap-3 text-sm text-text-secondary">
        <input
          type="checkbox"
          name="repeatWeekly"
          defaultChecked={current.repeatWeekly}
          className="mt-0.5 size-4 accent-accent"
        />
        <span>
          <span className="font-medium text-text-primary">Repeats weekly.</span> When
          this one closes, next week&rsquo;s appears by itself.
        </span>
      </label>

      <div>
        <SubmitButton label="Save changes" pendingLabel="Saving…" variant="secondary" />
      </div>
    </form>
  );
}

/**
 * Cancelling a night, in two taps and no `confirm()`.
 *
 * The first tap only reveals the question and the real button; nothing
 * is posted until "Yes, cancel it". A draft nobody touched is deleted
 * outright by the action, anything else is closed and marked, and the
 * Events tab says what happened.
 */
export function CancelEventForm({ eventId }: { eventId: string }) {
  const [asked, setAsked] = useState(false);

  if (!asked) {
    return (
      <div>
        <Button type="button" variant="danger" onClick={() => setAsked(true)}>
          Cancel this night
        </Button>
      </div>
    );
  }

  return (
    <form action={cancelEventAction} className="flex flex-col gap-3">
      <input type="hidden" name="eventId" value={eventId} />
      <p className="text-sm text-text-secondary">
        Players who joined will see it closed. Cancel it?
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <CancelSubmit />
        <Button type="button" variant="ghost" onClick={() => setAsked(false)}>
          Keep it
        </Button>
      </div>
    </form>
  );
}

/* `SubmitButton` has no danger variant, and a cancel should wear one. */
function CancelSubmit() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="danger"
      disabled={pending}
      aria-label="Yes, cancel it"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Cancelling…" : "Yes, cancel it"}
    </Button>
  );
}
