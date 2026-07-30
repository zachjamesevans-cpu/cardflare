import Image from "next/image";

import { cn } from "@/lib/cn";
import { SITE } from "@/lib/site";
import mark from "@public/brand/cardflare-mark.png";

interface LogoProps {
  /** Rendered size of the mark in pixels. */
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
        width={size}
        height={size}
        priority={priority}
        className="shrink-0"
      />
      {!markOnly && (
        <span className="text-lg font-bold tracking-tight text-text-primary">
          Card<span className="text-accent">Flare</span>
        </span>
      )}
    </span>
  );
}
