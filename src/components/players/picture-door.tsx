"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Wand2 } from "lucide-react";

/**
 * The top of Edit profile: the picture beside the avatar effects, and
 * one link under them.
 *
 * Instagram draws the profile picture in a circle next to a second
 * circle for the avatar, and under both a single "Edit picture or
 * avatar". Ours: the dressed picture, a wand circle that opens
 * Customize, and the same link. The link swaps the still picture for
 * the picture editor (camera button, remove, the upload state) and
 * brings the cover control in under it, so "Change cover" is behind
 * the same door. The app draws the same top (mobile/src/screens/
 * edit-profile.tsx).
 */
export function PictureDoor({
  picture,
  editor,
  cover,
}: {
  /** The picture as the profile shows it, dressed. */
  picture: ReactNode;
  /** The same picture with its controls: `AvatarForm`. */
  editor: ReactNode;
  /** The cover control: `CoverForm`. */
  cover: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-start justify-center gap-5">
        {open ? editor : picture}
        <Link
          href="/profile/customize"
          title="Avatar effects"
          className="flex size-24 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong bg-elevated/60 text-text-secondary transition-colors hover:border-accent hover:text-text-primary"
        >
          <Wand2 className="size-7" aria-hidden="true" />
          <span className="sr-only">Avatar effects</span>
        </Link>
      </div>

      {open ? (
        cover
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="cursor-pointer text-sm font-semibold text-accent underline-offset-4 hover:underline"
        >
          Edit picture or avatar
        </button>
      )}
    </div>
  );
}
