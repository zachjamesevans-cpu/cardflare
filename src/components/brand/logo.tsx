import Image from "next/image";

import { cn } from "@/lib/cn";
import { SITE } from "@/lib/site";
import mark from "@public/brand/cardflare-mark.png";

/**
 * The mark is taller than it is wide, so it is sized by height and its width
 * is derived from the file's own dimensions. Reading the aspect ratio from the
 * static import means a future master with different proportions stays
 * correctly shaped without touching this component.
 */
const ASPECT = mark.width / mark.height;

interface LogoProps {
  /** Rendered height of the mark in pixels. Width follows the artwork. */
  size?: number;
  /** Hides the wordmark, leaving the mark alone (used in tight spaces). */
  markOnly?: boolean;
  className?: string;
  /**
   * Set on the single most important instance (the header) so the mark is not
   * lazy-loaded into the largest contentful paint.
   */
  priority?: boolean;
}

export function Logo({
  size = 36,
  markOnly = false,
  className,
  priority = false,
}: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image
        src={mark}
        alt={markOnly ? `${SITE.name} logo` : ""}
        aria-hidden={markOnly ? undefined : true}
        width={Math.round(size * ASPECT)}
        height={size}
        priority={priority}
        className="shrink-0"
      />
      {!markOnly && (
        /* Lowercase and all one accent, matching the supplied wordmark
           art. The two-tone Card/Flare split belonged to the old mark. */
        <span className="font-display text-lg tracking-wide text-accent">
          cardflare
        </span>
      )}
    </span>
  );
}
