import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

import { cn } from "@/lib/cn";
import type { PreviewCard } from "./types";

/**
 * Shared building blocks for the marketing previews.
 *
 * Kept separate from any one screen so additional previews reuse the same
 * interface language, and so these can be lifted into the real application
 * once it renders live event data.
 */

/** Card thumbnail stand-in. No third-party card art is used anywhere. */
export function CardGlyph({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-14 w-10 shrink-0 items-center justify-center rounded-md border border-accent/35 bg-accent/10",
        className,
      )}
    >
      <Sparkles className="size-4 text-accent" />
    </div>
  );
}

export function CardIdentity({ card }: { card: PreviewCard }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-text-primary">{card.name}</p>
      <p className="truncate text-xs text-text-muted">
        {card.setCode} &middot; {card.printing}
      </p>
    </div>
  );
}

export function PreviewLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-bold tracking-wider text-text-muted uppercase">
      {children}
    </p>
  );
}

interface PreviewFrameProps {
  /**
   * Describes the whole preview to assistive technology. These are
   * illustrations whose chips are not real controls, so they are exposed as a
   * single labelled image rather than as fake interactive elements.
   */
  label: string;
  className?: string;
  children: ReactNode;
}

export function PreviewFrame({ label, className, children }: PreviewFrameProps) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "w-full max-w-[320px] overflow-hidden rounded-[var(--radius-panel)] border border-border bg-surface shadow-[var(--shadow-panel)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
