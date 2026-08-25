"use client";

import { useState } from "react";
import Image from "next/image";
import { Layers } from "lucide-react";

import { cn } from "@/lib/cn";
import { cardImageAlt, isRenderableImageUrl } from "@/lib/cards/images";

/**
 * cardflare's own placeholder.
 *
 * A generic card silhouette in cardflare's palette. Deliberately not a mock
 * One Piece card — it must never be mistaken for real artwork or imply a
 * licence cardflare does not have. Inline SVG so it costs no request and
 * cannot itself fail to load.
 */
function Placeholder({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 60 84"
      role="img"
      aria-label="No card image"
      className={cn("size-full", className)}
    >
      <rect
        x="1"
        y="1"
        width="58"
        height="82"
        rx="5"
        className="fill-elevated stroke-border"
        strokeWidth="1.5"
      />
      <rect x="8" y="8" width="44" height="34" rx="3" className="fill-border/50" />
      <rect x="8" y="49" width="44" height="3.5" rx="1.75" className="fill-border" />
      <rect x="8" y="57" width="32" height="3.5" rx="1.75" className="fill-border" />
      <rect x="8" y="65" width="38" height="3.5" rx="1.75" className="fill-border" />
      <circle cx="46" cy="70" r="6" className="fill-accent/20" />
    </svg>
  );
}

/**
 * A card thumbnail, or the placeholder.
 *
 * The wrapper holds a fixed aspect ratio, so the layout is identical whether
 * an image loads, fails, or was never requested. A result list must not reflow
 * because a third-party host was slow.
 *
 * When images are disabled no `<img>` is rendered at all, so nothing is
 * requested from a third party — the flag is not just a visual preference.
 */
export function CardThumbnail({
  imageUrl,
  exactName,
  cardNumber,
  enabled,
  anyPrinting = false,
  className,
}: {
  imageUrl: string | null;
  exactName: string;
  cardNumber: string;
  /** Resolved on the server from NEXT_PUBLIC_ENABLE_CARD_IMAGES. */
  enabled: boolean;
  /**
   * The artwork is a stand-in for whichever version turns up.
   *
   * Marked, because otherwise a specific piece of art reads as a specific
   * request — and someone holding the alternate art would wrongly conclude
   * they cannot help.
   */
  anyPrinting?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const renderable = enabled && !failed && isRenderableImageUrl(imageUrl);

  /*
   * `className` REPLACES the default width rather than joining it. `cn` is a
   * plain join with no conflict resolution, so "w-14" + "w-8" leaves both
   * classes in the markup and stylesheet order picks the winner — which is
   * how every "small" thumbnail in the search results quietly rendered at
   * full size and the founder saw a cluttered mess. Callers own the width.
   */
  return (
    <div
      className={cn(
        "relative aspect-[60/84] shrink-0 overflow-hidden rounded-[6px]",
        className ?? "w-14",
      )}
    >
      {/* Always mounted underneath, so a failure reveals it with no reflow. */}
      <Placeholder className="absolute inset-0" />

      {renderable && (
        <Image
          src={imageUrl}
          alt={cardImageAlt(exactName, cardNumber)}
          fill
          sizes="56px"
          className={cn(
            "object-cover transition-opacity duration-[var(--duration-base)]",
            loaded ? "opacity-100" : "opacity-0",
          )}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}

      {/*
       * Only over real artwork. The placeholder already reads as generic, and
       * a badge on top of it would be marking the absence of a picture.
       */}
      {anyPrinting && renderable && (
        <span
          /*
           * Icon only. Spelled out it covered most of a 56px thumbnail and hid
           * the artwork it was captioning, and the row already says "Any
           * printing" in words a few pixels to the right — this is a glance
           * cue, not the explanation.
           */
          title="Any version of this card"
          className="absolute right-0.5 bottom-0.5 flex size-4 items-center justify-center rounded-[4px] bg-canvas/90 text-text-secondary"
        >
          <Layers className="size-2.5" aria-hidden="true" />
          <span className="sr-only">Any version of this card</span>
        </span>
      )}
    </div>
  );
}
