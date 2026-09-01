"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ImageIcon, Loader2 } from "lucide-react";

import { ImageCropper } from "@/components/players/image-cropper";
import { setCoverAction } from "@/lib/players/profile-actions";
import {
  AVATAR_MAX_BYTES,
  checkAvatarFile,
  COVER_HEIGHT,
  COVER_WIDTH,
} from "@/lib/players/profile-image";
import { PROFILE_IDLE, type ProfileState } from "@/lib/players/profile-schema";

/**
 * Choosing a cover banner.
 *
 * Two things changed here at once, and they are the same change. The
 * founder could not upload a header photo from a Mac — a Retina
 * screenshot is several megabytes and the bucket takes two — and he
 * asked to be able to crop one. Both are answered by drawing the chosen
 * rectangle into a canvas at 1200x900 before anything is sent: what
 * leaves the browser is already the banner, already small.
 *
 * So the file no longer uploads the instant it is picked. There IS
 * something to review now: which part of the photo is the banner.
 */
export function CoverForm({ coverUrl }: { coverUrl: string | null }) {
  const [state, action] = useActionState<ProfileState, FormData>(
    setCoverAction,
    PROFILE_IDLE,
  );

  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  /** The photo being cropped, before it becomes the banner. */
  const [picked, setPicked] = useState<File | null>(null);

  /* The server's answer outranks the client check; the client check is
     cleared on every new pick, so no effect is needed to reconcile. */
  const said = state.status !== "idle" ? state.message : clientError;

  return (
    <form ref={form} action={action} className="flex flex-col gap-2">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary">
        <ImageIcon className="size-4" aria-hidden="true" />
        {coverUrl ? "Change your cover" : "Add a cover banner behind your picture"}
        <input
          ref={input}
          type="file"
          name="cover"
          /*
           * Every image type the browser can decode, not just the three
           * the bucket stores. A HEIC off an iPhone or a 6MB PNG off a
           * Mac is re-encoded to JPEG below, so what the bucket receives
           * is always something it accepts.
           */
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;

            setClientError(null);
            setPicked(file);
            /* Cleared so picking the same file twice still opens the
               cropper — a change event does not fire for an identical
               value. */
            event.currentTarget.value = "";
          }}
        />
        <Pending />
      </label>

      {picked && (
        <ImageCropper
          key={`${picked.name}:${picked.size}:${picked.lastModified}`}
          file={picked}
          aspect={COVER_WIDTH / COVER_HEIGHT}
          target={{
            width: COVER_WIDTH,
            height: COVER_HEIGHT,
            maxBytes: AVATAR_MAX_BYTES,
          }}
          onCancel={() => setPicked(null)}
          onDone={(prepared) => {
            const check = checkAvatarFile(prepared);
            if (!check.ok) {
              /* Should not happen — the pipeline targets this ceiling —
                 but a picture that somehow still will not fit says so
                 here rather than failing at the server. */
              setClientError(check.message);
              setPicked(null);
              return;
            }

            /* The cropped file replaces what the person chose, then the
               form submits exactly as it always did. */
            const carrier = new DataTransfer();
            carrier.items.add(prepared);
            if (input.current) input.current.files = carrier.files;

            setPicked(null);
            form.current?.requestSubmit();
          }}
        />
      )}

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
