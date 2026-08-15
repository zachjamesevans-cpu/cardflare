import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import type { EquipKind } from "@/lib/players/equips";

/**
 * The equipped catalogue, worn on a real profile.
 *
 * Same art classes the customize tiles preview - that is the whole
 * contract: what you tapped is what everyone sees. Every piece here
 * degrades to plain children when nothing is worn, so profiles without
 * equips render byte-for-byte as before.
 */

export type Worn = Partial<Record<EquipKind, string | null>>;

/*
 * No ring component here: the worn ring is drawn by PlayerAvatar itself
 * (its `ring` prop), because the ring must follow a player everywhere
 * their face shows - rosters, popups, boards - and every one of those
 * already renders PlayerAvatar.
 */

/** The name row: nameplate style, badge beside, title under. */
export function WornNameRow({
  name,
  worn,
  className,
}: {
  name: string;
  worn: Worn;
  className?: string;
}) {
  return (
    <span className={cn("flex flex-col items-center gap-1", className)}>
      <span className="flex items-center gap-2">
        <span
          className={cn(
            "cfx-name",
            worn.nameplate ? `cfa-${worn.nameplate}` : "text-text-primary",
          )}
        >
          {name}
        </span>
        {worn.badge && (
          <span className={cn("cfx-badge", `cfa-${worn.badge}`)}>
            {BADGE_MARKS[worn.badge] ?? "✦"}
          </span>
        )}
      </span>
      {worn.title && (
        <span className={cn("cfx-title-chip", `cfa-${worn.title}`)}>
          {TITLE_WORDS[worn.title] ?? "Title"}
        </span>
      )}
    </span>
  );
}

/** A showcase card wearing its border, pattern and animation. */
export function WornCardShell({
  worn,
  children,
  className,
}: {
  worn: Worn;
  children: ReactNode;
  className?: string;
}) {
  const dressed = worn.border || worn.pattern || worn.animation;
  if (!dressed) return <>{children}</>;

  return (
    <span
      className={cn(
        "cfx-card block",
        worn.border && `cfa-${worn.border}`,
        worn.animation && `cfa-${worn.animation}`,
        className,
      )}
    >
      {children}
      <span
        className={cn("cfx-card-fx", worn.pattern && `cfa-${worn.pattern}`)}
        aria-hidden="true"
      />
    </span>
  );
}

/** Background and scene, over and behind a profile block. */
export function WornSceneLayer({ worn }: { worn: Worn }) {
  if (!worn.scene) return null;
  return (
    <span
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]",
        `cfa-${worn.scene}`,
      )}
      aria-hidden="true"
    >
      <span className="cfx-panel-fx" />
    </span>
  );
}

export function backgroundClass(worn: Worn): string | undefined {
  return worn.background ? `cfa-${worn.background}` : undefined;
}

const TITLE_WORDS: Record<string, string> = {
  "title-custom-tagline": "Your line here",
  "title-trade-milestone": "Trade milestone",
  "title-collector": "Collector",
  "title-closer": "Closer",
  "title-regular": "Regular",
};

const BADGE_MARKS: Record<string, string> = {
  "badge-founder": "✦",
  "badge-beta-tester": "β",
  "badge-vendor": "⚑",
  "badge-lgs-staff": "♠",
  "badge-tournament-organizer": "♛",
  "badge-early-adopter": "☀",
  "badge-100-trades": "100",
  "badge-500-trades": "500",
  "badge-1000-trades": "1K",
};
