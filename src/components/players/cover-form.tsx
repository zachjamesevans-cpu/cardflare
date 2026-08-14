"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ImageIcon, Loader2 } from "lucide-react";

import { setCoverAction } from "@/lib/players/profile-actions";
import { checkAvatarFile } from "@/lib/players/profile-image";
import { PROFILE_IDLE, type ProfileState } from "@/lib/players/profile-schema";

/**
 * Choosing a cover banner - the avatar form's pattern, wide.
 *
 * Uploads the moment a file is picked, same as the picture: the server
 * owns the crop (1200x450, centre), so there is nothing to review in
 * between. The preview above is the profile block itself, which shows
 * the new banner as soon as the page revalidates.
 */
export function CoverForm({ coverUrl }: { coverUrl: string | null }) {
  const [state, action] = useActionState<ProfileState, FormData>(
    setCoverAction,
    PROFILE_IDLE,
  );

  const form = useRef<HTMLFormElement>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  /* The server's answer outranks the client check; the client check is
     cleared on every new pick, so no effect is needed to reconcile. */
  const said = state.status !== "idle" ? state.message : clientError;

  return (
    <form ref={form} action={action} className="flex flex-col gap-2">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary">
        <ImageIcon className="size-4" aria-hidden="true" />
        {coverUrl ? "Change your cover" : "Add a cover banner behind your picture"}
        <input
          type="file"
          name="cover"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;

            const check = checkAvatarFile(file);
            if (!check.ok) {
              setClientError(check.message);
              event.currentTarget.value = "";
              return;
            }

            setClientError(null);
            form.current?.requestSubmit();
          }}
        />
        <Pending />
      </label>

      {said && (
        <p
          role="status"
          className={
            state.status === "error" || (state.status === "idle" && clientError)
              ? "text-sm text-danger"
              : "text-sm text-success"
          }
        >
          {said}
        </p>
      )}
    </form>
  );
}

function Pending() {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return <Loader2 className="size-4 animate-spin text-accent" aria-hidden="true" />;
}
