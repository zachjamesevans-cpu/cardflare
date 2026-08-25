"use client";

import { useActionState, useState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { TextInput } from "@/components/ui/controls";
import { changeHandleAction } from "@/lib/players/profile-actions";
import { HANDLE_MAX, handleWhileTyping } from "@/lib/players/handle";
import { PROFILE_IDLE, type ProfileState } from "@/lib/players/profile-schema";

/**
 * Changing the handle people find you by.
 *
 * Separate from the name above it, because they are separate things:
 * the name can be anything and repeat, the handle is unique and has no
 * spaces in it. Somebody changing one almost never means the other.
 *
 * Typed straight into shape rather than validated after the fact — a
 * capital or a space becomes what the server would have made of it
 * anyway, so the field never shows something about to be refused.
 */
export function HandleForm({ handle }: { handle: string }) {
  const [state, action] = useActionState<ProfileState, FormData>(
    changeHandleAction,
    PROFILE_IDLE,
  );

  const [value, setValue] = useState(handle);

  return (
    <form action={action} className="flex flex-col gap-2">
      <label htmlFor="handle" className="text-sm font-medium text-text-secondary">
        Handle
      </label>

      <div className="flex flex-wrap gap-2">
        {/* Inside the field, so this input shares the left edge of the
            name input above it rather than starting a character in. */}
        <div className="relative min-w-0 flex-1 basis-48">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
          >
            @
          </span>
          <TextInput
            id="handle"
            name="handle"
            value={value}
            onChange={(event) => setValue(handleWhileTyping(event.target.value))}
            maxLength={HANDLE_MAX}
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            className="w-full pl-7"
          />
        </div>
        <SubmitButton label="Save" pendingLabel="Saving…" variant="secondary" />
      </div>

      {state.status !== "idle" && (
        <p
          role="status"
          className={`text-sm ${
            state.status === "error" ? "text-danger" : "text-success"
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
