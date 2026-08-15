"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { Camera, Loader2, Trash2 } from "lucide-react";

import { FRAME_CLASS, PlayerAvatar } from "@/components/players/player-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
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
  frame = null,
  ring = null,
}: {
  displayName: string;
  seed: string;
  avatarUrl: string | null;
  /**
   * The equipped frame, worn here too. The founder bought one, equipped
   * it, and looked at their own profile first: this component showed a
   * bare picture, because nothing ever handed it the frame. The place
   * that sells the borders was the one place guaranteed not to show one.
   */
  frame?: string | null;
  /** The catalogue ring, worn over the frame - same story, second slot. */
  ring?: string | null;
}) {
  const [state, action] = useActionState<ProfileState, FormData>(
    setAvatarAction,
    PROFILE_IDLE,
  );

  const form = useRef<HTMLFormElement>(null);

  /** A rejection this component made itself, before anything was sent. */
  const [rejected, setRejected] = useState<string | null>(null);

  /*
   * The picture that was just chosen, shown from the local file while
   * the server is still decoding it.
   *
   * The founder's report: "doesn't show a preview when added". It did
   * not, and could not — the only picture on screen came from the
   * server, so nothing changed until a round trip that involves resizing
   * a photograph had finished. An object URL costs nothing and shows the
   * choice the instant it is made.
   */
  const [preview, setPreview] = useState<string | null>(null);

  /*
   * Revoked on unmount rather than on replacement, because the <img>
   * still needs the previous URL until React has painted the new one.
   * Held in a ref so the cleanup does not re-run every time the preview
   * changes and pull the picture out from under the render.
   */
  const objectUrls = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  /** True when the stored picture exists but the browser cannot load it. */
  const [broken, setBroken] = useState(false);

  const message = rejected ?? (state.status === "error" ? state.message : null);

  /*
   * The preview wins while it exists: after a successful upload the
   * server's URL and the local file are the same picture, and swapping
   * one for the other would flash. A failed upload keeps showing what
   * was chosen, next to the error saying why it did not stick, which is
   * more use than reverting to the old picture with no explanation.
   */
  const shown = preview ?? avatarUrl;

  return (
    <div className="flex flex-col items-center gap-3">
      <form ref={form} action={action} className="relative">
        {shown && !broken ? (
          /*
           * The frame lives on this wrapper, not on the <img>: replaced
           * elements cannot carry the pseudo-element the animated rings
           * are drawn with. Same rule as PlayerAvatar.
           */
          <span
            className={cn(
              "relative inline-flex size-24 rounded-full",
              !ring && frame ? FRAME_CLASS[frame] : "",
            )}
          >
            {ring && (
              <span className={cn("cfx-ring-avatar", `cfa-${ring}`)} aria-hidden="true">
                <span className="cfx-ring-fx" />
                <span className="cfx-ring-band" />
              </span>
            )}
            {/*
             * Unoptimised on purpose, and it has to be: the src is either
             * a blob: URL, which the optimiser cannot fetch at all, or a
             * picture the server already re-encoded to a 512px square,
             * so optimising it again would cost a round trip to save
             * nothing.
             */}
            <Image
              src={shown}
              alt=""
              width={96}
              height={96}
              unoptimized
              /*
               * A broken image beside "Picture updated." is the exact
               * failure the founder saw. Falling back to the initials
               * keeps the avatar honest, and the line below says the
               * picture could not be loaded rather than pretending.
               */
              onError={() => setBroken(true)}
              className="size-full rounded-full border border-border object-cover"
            />
          </span>
        ) : (
          <PlayerAvatar
            displayName={displayName}
            seed={seed}
            frame={frame}
            ring={ring}
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

              const url = URL.createObjectURL(file);
              objectUrls.current.push(url);

              setPreview(url);
              setBroken(false);
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

      {/*
       * A broken picture outranks "Picture updated.". The save really did
       * happen, so this does not call it a failure — it says what is
       * actually on screen, which is the initials.
       */}
      {!message && broken && (
        <p role="status" className="text-center text-sm text-warning">
          Your picture saved, but it could not be loaded here. Showing your initials for
          now.
        </p>
      )}

      {!message && !broken && state.status === "saved" && (
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
