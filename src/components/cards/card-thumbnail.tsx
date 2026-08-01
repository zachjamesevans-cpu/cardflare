"use client";

import { useState } from "react";
import Image from "next/image";

import { cn } from "@/lib/cn";
import { cardImageAlt, isRenderableImageUrl } from "@/lib/cards/images";

/**
 * CardFlare's own placeholder.
 *
 * A generic card silhouette in CardFlare's palette. Deliberately not a mock
 * One Piece card — it must never be mistaken for real artwork or imply a
 * licence CardFlare does not have. Inline SVG so it costs no request and
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
  className,
}: {
  imageUrl: string | null;
  exactName: string;
  cardNumber: string;
  /** Resolved on the server from NEXT_PUBLIC_ENABLE_CARD_IMAGES. */
  enabled: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const renderable = enabled && !failed && isRenderableImageUrl(imageUrl);

  return (
    <div
      className={cn(
        "relative aspect-[60/84] w-14 shrink-0 overflow-hidden rounded-[6px]",
        className,
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
    </div>
  );
}
