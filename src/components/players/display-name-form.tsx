"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import { TextInput } from "@/components/ui/controls";
import { renameProfileAction } from "@/lib/players/profile-actions";
import { PROFILE_IDLE, type ProfileState } from "@/lib/players/profile-schema";

/**
 * Renaming yourself.
 *
 * This is the name a room shows above your Flares and the one somebody
 * says out loud when they walk over, so it is the first editable thing
 * on the profile rather than something buried in settings.
 */
export function DisplayNameForm({ displayName }: { displayName: string }) {
  const [state, action] = useActionState<ProfileState, FormData>(
    renameProfileAction,
    PROFILE_IDLE,
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      <label htmlFor="displayName" className="text-sm font-medium text-text-secondary">
        Display name
      </label>

      <div className="flex flex-wrap gap-2">
        <TextInput
          id="displayName"
          name="displayName"
          defaultValue={displayName}
          maxLength={40}
          required
          autoComplete="nickname"
          className="min-w-0 flex-1 basis-48"
        />
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
