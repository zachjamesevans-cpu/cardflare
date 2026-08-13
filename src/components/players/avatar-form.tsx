"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { Camera, Loader2, Trash2 } from "lucide-react";

import { PlayerAvatar } from "@/components/players/player-avatar";
import { Button } from "@/components/ui/button";
import { clearAvatarAction, setAvatarAction } from "@/lib/players/profile-actions";
import { checkAvatarFile } from "@/lib/players/profile-image";
import { PROFILE_IDLE, type ProfileState } from "@/lib/players/profile-schema";

/**
 * Choosing a profile picture.
 *
 * The picture uploads the moment one is picked — no "choose a file, then
 * press Save". A two-step upload is a step somebody abandons halfway,
 * and there is nothing to review in between: the server decides the crop
 * and the size, so the only thing the player is choosing is which photo.
 *
 * The file is checked here before it is sent, purely to save a doomed
 * upload over a phone connection. `setAvatarAction` re-checks all of it,
 * because a Server Action is a public POST endpoint and this runs on the
 * client where anything can be edited.
 */
export function AvatarForm({
  displayName,
  seed,
  avatarUrl,
}: {
  displayName: string;
  seed: string;
  avatarUrl: string | null;
}) {
  const [state, action] = useActionState<ProfileState, FormData>(
    setAvatarAction,
    PROFILE_IDLE,
  );

  const form = useRef<HTMLFormElement>(null);

  /** A rejection this component made itself, before anything was sent. */
  const [rejected, setRejected] = useState<string | null>(null);

  const message = rejected ?? (state.status === "error" ? state.message : null);

  return (
    <div className="flex flex-col items-center gap-3">
      <form ref={form} action={action} className="relative">
        {avatarUrl ? (
          /*
           * Unoptimised on purpose. This is already exactly the size and
           * format it needs to be — the server re-encoded it to a 512px
           * WebP square before storing it — so running it through the
           * optimiser again would cost a round trip to save nothing.
           */
          <Image
            src={avatarUrl}
            alt=""
            width={96}
            height={96}
            unoptimized
            className="size-24 rounded-full border border-border object-cover"
          />
        ) : (
          <PlayerAvatar
            displayName={displayName}
            seed={seed}
            className="size-24 text-2xl"
          />
        )}

        <Uploading />

        <label
          className="absolute -right-1 -bottom-1 flex size-9 cursor-pointer items-center justify-center rounded-full border border-border bg-elevated text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
          title="Change your picture"
        >
          <Camera className="size-4" aria-hidden="true" />
          <span className="sr-only">Change your picture</span>
          <input
            type="file"
            name="avatar"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;

              const check = checkAvatarFile(file);
              if (!check.ok) {
                setRejected(check.message);
                event.target.value = "";
                return;
              }

              setRejected(null);
              form.current?.requestSubmit();
            }}
          />
        </label>
      </form>

      {/*
       * Only rendered when there is something to remove. A control that
       * does nothing is worse than no control.
       */}
      {avatarUrl && (
        <form action={clearAvatarAction}>
          <Button type="submit" variant="ghost" size="sm">
            <Trash2 className="size-3.5" aria-hidden="true" />
            Remove picture
          </Button>
        </form>
      )}

      {message && (
        <p role="status" className="text-center text-sm text-danger">
          {message}
        </p>
      )}
      {!message && state.status === "saved" && (
        <p role="status" className="text-center text-sm text-success">
          {state.message}
        </p>
      )}
    </div>
  );
}

/**
 * The upload in progress, over the picture it is replacing.
 *
 * Its own component because `useFormStatus` reports on the form its
 * caller sits inside, so it has to be a child of that form rather than
 * part of the component that renders it. The founder's standing rule
 * from the remove-button round applies here too: a press that takes a
 * moment must show that it landed, and an upload over a phone connection
 * takes several.
 */
function Uploading() {
  const { pending } = useFormStatus();
  if (!pending) return null;

  return (
    <span
      role="status"
      className="absolute inset-0 flex items-center justify-center rounded-full bg-canvas/70"
    >
      <Loader2 className="size-6 animate-spin text-accent" aria-hidden="true" />
      <span className="sr-only">Uploading your picture</span>
    </span>
  );
}
