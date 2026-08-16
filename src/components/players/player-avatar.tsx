"use client";

import { useState } from "react";
import Image from "next/image";

import { cn } from "@/lib/cn";
import { avatarHue, initials } from "@/lib/players/avatar";
import { RiveArt } from "@/components/players/rive-art";
import type { RiveArtRef } from "@/components/players/cosmetic-art";

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
 * The frame a player bought, drawn around them.
 *
 * Written out one class per slug for the same reason the card frames
 * are: Tailwind cannot see a class assembled at runtime, and an unknown
 * slug falls through to no frame, which is the right failure for a
 * cosmetic that was removed from the catalogue.
 *
 * Exported so the shop can draw the same ring on its tiles: a border is
 * the one cosmetic whose whole pitch is how it looks, and a tile that
 * describes it in words is selling it short. The unit test in
 * tests/unit/cosmetic-frames.test.ts holds this map, the card map, the
 * CSS and the catalogue migrations to the same set of slugs.
 */
export const FRAME_CLASS: Record<string, string> = {
  plain: "",
  "ember-edge": "cf-avatar-frame-ember-edge",
  "lime-edge": "cf-avatar-frame-lime-edge",
  "prism-edge": "cf-avatar-frame-prism-edge",
  "frost-edge": "cf-avatar-frame-frost-edge",
  "rose-edge": "cf-avatar-frame-rose-edge",
  "gilded-edge": "cf-avatar-frame-gilded-edge",
  "molten-edge": "cf-avatar-frame-molten-edge",
  "galaxy-edge": "cf-avatar-frame-galaxy-edge",
};

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
  frame = null,
  ring = null,
  aura = null,
  ringRive = null,
  auraRive = null,
  size = "md",
  className,
}: {
  displayName: string;
  /** Stable per player, so the colour never changes under them. */
  seed: string;
  /** A stored profile picture, or null for the generated mark. */
  avatarUrl?: string | null;
  /**
   * The cosmetic frame slug they have equipped, or null for none.
   *
   * Drawn on the initials as well as on a picture: somebody who spent
   * 600 Embers on the Prism Edge should be wearing it whether or not
   * they have uploaded a photograph.
   */
  frame?: string | null;
  /**
   * The catalogue ring slug they wear (the new profile borders). Worn
   * INSTEAD of the old frame when both are set: two rings around one
   * picture is clutter, and the newer choice is the one they made last.
   * Passing it here rather than wrapping the avatar externally is what
   * keeps every surface in step - the founder wore a new ring and the
   * roster kept showing the old frame, because the two were drawn by
   * different code.
   */
  ring?: string | null;
  /**
   * The avatar effect: the animation floating around the picture,
   * split out of the borders at the founder's ask so the two mix and
   * match. Rides with any ring or frame.
   */
  aura?: string | null;
  /** The dropped-in file behind the ring or aura, when it is a Rive one. */
  ringRive?: RiveArtRef | null;
  auraRive?: RiveArtRef | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const [broken, setBroken] = useState(false);

  const box = cn(
    "relative inline-flex shrink-0 items-center justify-center rounded-full border",
    size === "sm" ? "size-8 text-xs" : "size-10 text-sm",
    !ring && frame ? FRAME_CLASS[frame] : "",
    className,
  );

  /* The worn catalogue ring and aura, proportional to whatever size
     this is. Two independent layers - mix and match - and either can
     be a dropped-in Rive file instead of CSS art, in which case the
     file is the whole layer. */
  const wornRing = (
    <>
      {ringRive ? (
        <span className="pointer-events-none absolute inset-[-14%]" aria-hidden="true">
          <RiveArt
            url={ringRive.url}
            artboard={ringRive.artboard}
            stateMachine={ringRive.stateMachine}
          />
        </span>
      ) : (
        ring && (
          <span className={cn("cfx-ring-avatar", `cfa-${ring}`)} aria-hidden="true">
            <span className="cfx-ring-fx" />
            <span className="cfx-ring-band" />
          </span>
        )
      )}
      {auraRive ? (
        <span className="pointer-events-none absolute inset-[-22%]" aria-hidden="true">
          <RiveArt
            url={auraRive.url}
            artboard={auraRive.artboard}
            stateMachine={auraRive.stateMachine}
          />
        </span>
      ) : (
        aura && (
          <span className={cn("cfx-aura-avatar", `cfa-${aura}`)} aria-hidden="true">
            <span className="cfx-aura-fx" />
          </span>
        )
      )}
    </>
  );

  if (avatarUrl && !broken) {
    return (
      /*
       * The frame classes sit on a wrapper, never on the <img> itself.
       * The first cut put them on the image, and the three travelling
       * frames (Prism, Molten, Galaxy) never rendered on anyone with a
       * picture: they are drawn with an ::after pseudo-element, and
       * replaced elements like <img> cannot have pseudo-elements, so
       * browsers dropped the ring without a word. The static box-shadow
       * rings happened to survive, which made the failure look like it
       * depended on WHICH frame was bought. One wrapper for every frame
       * and the geometry is the same for all of them.
       */
      <span aria-hidden="true" className={cn(box, "border-border")}>
        <Image
          src={avatarUrl}
          alt=""
          width={PIXELS[size]}
          height={PIXELS[size]}
          /*
           * Unoptimised: the server already re-encoded this to a 512px
           * square before storing it, so the optimiser would cost a
           * round trip to save nothing.
           */
          unoptimized
          onError={() => setBroken(true)}
          className="size-full rounded-full object-cover"
        />
        {wornRing}
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(box, "font-semibold", HUE_CLASS[avatarHue(seed)])}
    >
      {initials(displayName)}
      {wornRing}
    </span>
  );
}
