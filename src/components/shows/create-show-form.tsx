"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, TextInput } from "@/components/ui/controls";
import { describedBy, Field, fieldIds } from "@/components/ui/field";
import { createShowAction } from "@/lib/shows/actions";
import { CREATE_SHOW_IDLE } from "@/lib/shows/schema";

/**
 * Creating a card show.
 *
 * The one form where a timezone is typed alongside the times: a show belongs
 * to no store, so there is no store row to carry the zone. The zones list is
 * rendered server-side into props to keep `Intl.supportedValuesOf` off the
 * client bundle's critical path — same trick as the store's picker.
 */

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Creating…" : "Create show"}
    </Button>
  );
}

export function CreateShowForm({
  zones,
  defaultZone,
  defaultStartsAt,
  defaultEndsAt,
}: {
  zones: string[];
  defaultZone: string;
  defaultStartsAt: string;
  defaultEndsAt: string;
}) {
  const [state, formAction] = useActionState(createShowAction, CREATE_SHOW_IDLE);

  return (
    <div className="flex flex-col gap-4">
      {state.status === "created" && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-[var(--radius-control)] border border-accent/30 bg-accent/[0.07] px-4 py-3 text-sm text-text-secondary"
        >
          <CheckCircle2
            className="mt-0.5 size-4 shrink-0 text-accent"
            aria-hidden="true"
          />
          <span>
            Show created. Open it below to print its code and watch the roster.
          </span>
        </p>
      )}

      <form
        key={state.status === "created" ? "done" : "editing"}
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
          {state.status === "error" ? (state.message ?? "") : ""}
        </p>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            name="name"
            label="Show name"
            error={state.fieldErrors.name}
            className="sm:col-span-2"
          >
            <TextInput
              {...fieldIds("name")}
              name="name"
              required
              placeholder="Dallas Card Show"
              aria-invalid={state.fieldErrors.name ? true : undefined}
              aria-describedby={describedBy("name", !!state.fieldErrors.name, false)}
            />
          </Field>

          <Field name="city" label="City" optional error={state.fieldErrors.city}>
            <TextInput {...fieldIds("city")} name="city" />
          </Field>

          <Field
            name="region"
            label="State or region"
            optional
            error={state.fieldErrors.region}
          >
            <TextInput {...fieldIds("region")} name="region" />
          </Field>

          <Field
            name="timezone"
            label="Timezone"
            hint="Where the venue is. The dates below mean this zone."
            error={state.fieldErrors.timezone}
          >
            <Select
              {...fieldIds("timezone")}
              name="timezone"
              defaultValue={defaultZone}
            >
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
          </Field>

          <div className="hidden sm:block" />

          <Field name="startsAt" label="Doors open" error={state.fieldErrors.startsAt}>
            <TextInput
              {...fieldIds("startsAt")}
              name="startsAt"
              type="datetime-local"
              defaultValue={defaultStartsAt}
              required
            />
          </Field>

          <Field name="endsAt" label="Doors close" error={state.fieldErrors.endsAt}>
            <TextInput
              {...fieldIds("endsAt")}
              name="endsAt"
              type="datetime-local"
              defaultValue={defaultEndsAt}
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
