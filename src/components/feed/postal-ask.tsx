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

export function PostalAsk({
  defaultValue = "",
  /**
   * Whether an emptied field may be submitted to take the location
   * back. True only in settings, where that is the point. The ask
   * cards leave it off, because there an empty submit is always the
   * placeholder trap: the field LOOKED filled, the submit carried
   * nothing, and the founder's saved ZIP was cleared with a cheerful
   * "Location cleared." where his stores should have appeared.
   */
  allowClear = false,
}: {
  defaultValue?: string;
  allowClear?: boolean;
}) {
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
            placeholder="ZIP code"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={10}
            required={!allowClear}
            className="w-28"
            aria-label="ZIP code"
          />
        </label>
        <SaveButton />
      </div>

      <p className="text-xs text-text-muted">
        {allowClear
          ? "Just the ZIP. Enough to find shops within a few miles, and nothing like an address. Clear the field any time to stop."
          : "Just the five digits. Nothing like an address."}
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
