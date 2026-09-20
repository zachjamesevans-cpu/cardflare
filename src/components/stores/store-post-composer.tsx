"use client";

import { useActionState, useRef } from "react";
import { ImagePlus } from "lucide-react";

import { SubmitButton } from "@/components/ui/submit-button";
import { Select, TextInput, Textarea } from "@/components/ui/controls";
import { Field, fieldIds } from "@/components/ui/field";
import { publishStorePostAction } from "@/lib/stores/post-actions";
import {
  STORE_POST_BODY_MAX,
  STORE_POST_IDLE,
  STORE_POST_TITLE_MAX,
  type StorePostState,
} from "@/lib/stores/post-schema";
import { STORE_IMAGE_MIME_TYPES } from "@/lib/stores/store-image";

/**
 * The compose card: a title, a line or two, a picture if they have one,
 * and which night it is about.
 *
 * A client component only because `useActionState` is how the server's
 * validation message gets back to the person who typed the thing it
 * rejected; the caps on the inputs are a convenience and the schema is
 * the rule. The form clears itself on a successful post, so the next
 * announcement does not start as a copy of the last.
 */
export function StorePostComposer({
  storeId,
  events,
}: {
  storeId: string;
  /** The store's upcoming nights, soonest first, by name and date. */
  events: { id: string; label: string }[];
}) {
  const form = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState<StorePostState, FormData>(
    async (previous, formData) => {
      const next = await publishStorePostAction(previous, formData);
      if (next.status === "done") form.current?.reset();
      return next;
    },
    STORE_POST_IDLE,
  );

  return (
    <form ref={form} action={action} className="flex flex-col gap-4">
      <input type="hidden" name="storeId" value={storeId} />

      <Field name="title" label="Title">
        <TextInput
          {...fieldIds("title")}
          name="title"
          maxLength={STORE_POST_TITLE_MAX}
          required
          placeholder="OP-12 prerelease Saturday, 20 seats"
        />
      </Field>

      <Field
        name="body"
        label="What to say"
        optional
        hint={`Up to ${STORE_POST_BODY_MAX} characters. Doors, entry, prizing, what to bring.`}
      >
        <Textarea
          {...fieldIds("body")}
          name="body"
          rows={4}
          maxLength={STORE_POST_BODY_MAX}
        />
      </Field>

      <Field
        name="eventId"
        label="About an event night"
        hint="Followers get an I'll be there button that puts them on that board."
      >
        <Select {...fieldIds("eventId")} name="eventId" defaultValue="">
          <option value="">Not about an event</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        name="image"
        label="Picture"
        optional
        hint="Wide works best; it is shown 16:9. PNG, JPEG or WebP under 2MB."
      >
        <label
          htmlFor={fieldIds("image").id}
          className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-dashed border-border bg-canvas px-3 py-2.5 text-sm text-text-secondary hover:border-border-strong"
        >
          <ImagePlus className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
          <input
            {...fieldIds("image")}
            type="file"
            name="image"
            accept={STORE_IMAGE_MIME_TYPES.join(",")}
            className="min-w-0 flex-1 text-sm file:mr-3 file:rounded-[var(--radius-control)] file:border file:border-border file:bg-elevated file:px-3 file:py-1 file:text-sm file:font-semibold file:text-text-primary"
          />
        </label>
      </Field>

      {state.message && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error" ? "text-sm text-danger" : "text-sm text-accent"
          }
        >
          {state.message}
        </p>
      )}

      <div>
        <SubmitButton label="Post to followers" pendingLabel="Posting…" />
      </div>
    </form>
  );
}
