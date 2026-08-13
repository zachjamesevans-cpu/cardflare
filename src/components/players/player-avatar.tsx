"use client";

import { useState } from "react";
import Image from "next/image";

import { cn } from "@/lib/cn";
import { avatarHue, initials } from "@/lib/players/avatar";

/**
 * Tailwind cannot see a class name built at runtime, so the six hues are
 * written out. Keeping them adjacent to `AVATAR_HUE_COUNT` is enforced by
 * tests/unit/design-tokens.test.ts rather than by hoping.
 */
const HUE_CLASS: Record<number, string> = {
  1: "text-avatar-1 bg-avatar-1/12 border-avatar-1/25",
  2: "text-avatar-2 bg-avatar-2/12 border-avatar-2/25",
  3: "text-avatar-3 bg-avatar-3/12 border-avatar-3/25",
  4: "text-avatar-4 bg-avatar-4/12 border-avatar-4/25",
  5: "text-avatar-5 bg-avatar-5/12 border-avatar-5/25",
  6: "text-avatar-6 bg-avatar-6/12 border-avatar-6/25",
};

const PIXELS: Record<"sm" | "md", number> = { sm: 32, md: 40 };

/**
 * A player's avatar: their picture if they have chosen one, otherwise
 * their initials over a colour derived from their session.
 *
 * The founder's report was that a profile picture never showed up in a
 * room, and it never could: this component had no way to be given one.
 * Now it takes an optional `avatarUrl`, so one component is the avatar
 * everywhere — the roster, the lobby, the Flare board, the profile — and
 * there is nowhere for the two to drift apart.
 *
 * A client component so a picture that fails to load can fall back to
 * the initials. That fallback is the whole reason the generated mark
 * still exists: a guest has no account to hold a picture, a player may
 * not have chosen one, and a phone on shop wifi may simply not fetch it.
 * None of those should leave a hole where somebody's face goes.
 *
 * Decorative — the display name is always rendered beside it — so it is
 * hidden from assistive technology rather than read out as a stray
 * letter.
 */
export function PlayerAvatar({
  displayName,
  seed,
  avatarUrl = null,
  size = "md",
  className,
}: {
  displayName: string;
  /** Stable per player, so the colour never changes under them. */
  seed: string;
  /** A stored profile picture, or null for the generated mark. */
  avatarUrl?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const [broken, setBroken] = useState(false);

  const box = cn(
    "inline-flex shrink-0 items-center justify-center rounded-full border",
    size === "sm" ? "size-8 text-xs" : "size-10 text-sm",
    className,
  );

  if (avatarUrl && !broken) {
    return (
      <Image
        aria-hidden="true"
        src={avatarUrl}
        alt=""
        width={PIXELS[size]}
        height={PIXELS[size]}
        /*
         * Unoptimised: the server already re-encoded this to a 512px
         * WebP square before storing it, so the optimiser would cost a
         * round trip to save nothing.
         */
        unoptimized
        onError={() => setBroken(true)}
        className={cn(box, "border-border object-cover")}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(box, "font-semibold", HUE_CLASS[avatarHue(seed)])}
    >
      {initials(displayName)}
    </span>
  );
}
