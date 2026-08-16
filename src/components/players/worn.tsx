import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { RiveArt } from "@/components/players/rive-art";
import type { RiveArtRef } from "@/components/players/cosmetic-art";
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

/** The dropped-in files behind whatever is worn, by category. */
export type WornRive = Partial<Record<EquipKind, RiveArtRef | null>>;

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
  rive,
  children,
  className,
}: {
  worn: Worn;
  rive?: WornRive;
  children: ReactNode;
  className?: string;
}) {
  const dressed = worn.border || worn.pattern || worn.animation;
  if (!dressed) return <>{children}</>;

  /* A Rive border, pattern or animation plays over the card face. Each
     is its own layer, so a Rive foil and a CSS border still mix. */
  const films = (["border", "pattern", "animation"] as const).flatMap((kind) => {
    const film = rive?.[kind] ?? null;
    return film ? [{ kind, film }] : [];
  });

  /*
   * The padded, coloured edge exists ONLY when a border is worn. The
   * first cut drew the scaffold's default dark edge whenever anything
   * was worn, and a pattern with no border shipped every card inside
   * "this blueish frame" - the founder's words - that nobody chose.
   */
  return (
    <span
      className={cn(
        worn.border ? "cfx-card block" : "cfx-card-bare block",
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
      {films.map(({ kind, film }) => (
        <span
          key={kind}
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
          aria-hidden="true"
        >
          <RiveArt
            url={film.url}
            artboard={film.artboard}
            stateMachine={film.stateMachine}
            fit="cover"
          />
        </span>
      ))}
    </span>
  );
}

/** Background and scene, over and behind a profile block. */
export function WornSceneLayer({ worn, rive }: { worn: Worn; rive?: WornRive }) {
  const film = rive?.scene ?? null;

  if (film) {
    return (
      <span
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
        aria-hidden="true"
      >
        <RiveArt
          url={film.url}
          artboard={film.artboard}
          stateMachine={film.stateMachine}
          fit="cover"
        />
      </span>
    );
  }

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

/**
 * The showcase shelf's backdrop, when the worn background is a Rive
 * file. CSS backgrounds stay a class on the panel (backgroundClass);
 * a file needs a layer of its own to play in.
 */
export function WornBackdrop({ rive }: { rive?: WornRive }) {
  const film = rive?.background ?? null;
  if (!film) return null;

  return (
    <span
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      aria-hidden="true"
    >
      <RiveArt
        url={film.url}
        artboard={film.artboard}
        stateMachine={film.stateMachine}
        fit="cover"
      />
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
