import Image from "next/image";

import { cn } from "@/lib/cn";
import { SITE } from "@/lib/site";
import wordmark from "@public/brand/cardflare-wordmark-cut.png";

/*
 * THE WORDMARK ALONE, FOR NOW.
 *
 * The mark, the little card, used to ride beside the name everywhere.
 * The founder (2026-09-29): "Remove the cardflare logo from everywhere
 * on website... keep cardflare. But just remove the little PNG
 * everywhere. Just going to see what it looks like." So the lockup is
 * the drawn name on its own. `size` still means what it meant, the
 * height the mark would have had, so the name stays exactly the size it
 * was beside it and nothing else on the page moves. Putting the mark
 * back is one import and one <Image>.
 */
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
  /** The height the mark had, in pixels; the name is scaled from it. */
  size?: number;
  className?: string;
  /**
   * Set on the single most important instance (the header) so the mark is not
   * lazy-loaded into the largest contentful paint.
   */
  priority?: boolean;
}

export function Logo({ size = 36, className, priority = false }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      {/* The name, in the founder's own artwork. The alt carries the
          product name so the lockup still reads "cardflare" to a screen
          reader and to the header link's accessible name. */}
      <Image
        src={wordmark}
        alt={SITE.name}
        width={Math.round(size * WORDMARK_SCALE * WORDMARK_ASPECT)}
        height={Math.round(size * WORDMARK_SCALE)}
        priority={priority}
        className="shrink-0"
      />
    </span>
  );
}
