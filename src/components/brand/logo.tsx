import Image from "next/image";

import { cn } from "@/lib/cn";
import { SITE } from "@/lib/site";
import mark from "@public/brand/cardflare-mark.png";
import wordmark from "@public/brand/cardflare-wordmark-cut.png";

/**
 * The mark is taller than it is wide, so it is sized by height and its width
 * is derived from the file's own dimensions. Reading the aspect ratio from the
 * static import means a future master with different proportions stays
 * correctly shaped without touching this component.
 */
const ASPECT = mark.width / mark.height;
const WORDMARK_ASPECT = wordmark.width / wordmark.height;

/**
 * The wordmark image's height relative to the mark's.
 *
 * The name is ARTWORK now, not text: the founder supplied the drawn
 * wordmark after three rounds of font-matching and said "Just put this
 * everywhere" (2026-08-25), so every place the name used to be set in a
 * display face draws his file instead. The image carries its own glow
 * padding — about a sixth of its height above and below the lettering —
 * so it renders taller than the letters look; 0.62 puts the visible
 * lettering at the height the old text sat at, riding alongside a mark
 * of any size.
 */
const WORDMARK_SCALE = 0.62;

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
        /* The name, in the founder's own artwork. The alt carries the
           product name so the lockup still reads "cardflare" to a
           screen reader and to the header link's accessible name. */
        <Image
          src={wordmark}
          alt={SITE.name}
          width={Math.round(size * WORDMARK_SCALE * WORDMARK_ASPECT)}
          height={Math.round(size * WORDMARK_SCALE)}
          priority={priority}
          className="shrink-0"
        />
      )}
    </span>
  );
}
