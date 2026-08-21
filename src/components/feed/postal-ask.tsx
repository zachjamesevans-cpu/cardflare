"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { savePostalCodeAction } from "@/lib/players/location-actions";
import { POSTAL_IDLE, type PostalState } from "@/lib/players/location-schema";

/**
 * Asking a player roughly where they are, in five digits.
 *
 * The website's half of the founder's correction - "it should be asking
 * for location permissions to find stores near them, or at the very
 * least asking for a zip code". On a phone the permission prompt is
 * worth showing first; in a browser it is not, so this is the whole
 * question here.
 *
 * The copy says what it is for and what it is not, because a location
 * field with no explanation is a field people close the tab on.
 */
function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Show stores"}
    </Button>
  );
}

export function PostalAsk({ defaultValue = "" }: { defaultValue?: string }) {
  const [state, action] = useActionState<PostalState, FormData>(
    savePostalCodeAction,
    POSTAL_IDLE,
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="sr-only">ZIP code</span>
          <TextInput
            name="postalCode"
            defaultValue={defaultValue}
            placeholder="97477"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={10}
            className="w-28"
            aria-label="ZIP code"
          />
        </label>
        <SaveButton />
      </div>

      <p className="text-xs text-text-muted">
        Just the ZIP — enough to find shops within a few miles, and nothing like an
        address. Clear the field any time to stop.
      </p>

      {state.message && (
        <p
          className={`text-xs ${state.status === "error" ? "text-danger" : "text-accent"}`}
          role="status"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
