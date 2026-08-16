import { cn } from "@/lib/cn";
import { CosmeticFilm } from "@/components/players/cosmetic-film";

/** The uploaded file behind a cosmetic, when it has one. */
export interface CosmeticArtFileRef {
  /** rive plays in a canvas; svg is a drawing that animates itself. */
  kind: "rive" | "svg";
  url: string;
  artboard: string | null;
  stateMachine: string | null;
}

/**
 * One draft cosmetic, drawn for real.
 *
 * Every kind gets the scaffold it will actually dress - a ring wraps a
 * picture, a border wraps a card, a scene plays behind a profile - and
 * the slug's own `.cfa-` class (src/app/cosmetic-art.css) does the
 * drawing. This is the same class that will dress the real thing when
 * the cosmetic goes live, so what the console shows is what ships.
 *
 * The name previews say CHUNC because the founder judges these on his
 * own profile, and "Sample" tells you nothing about how a real handle
 * carries the style.
 */
export function CosmeticArt({
  kind,
  slug,
  art = null,
  className,
}: {
  kind: string;
  slug: string;
  /** A dropped-in file. When set, it IS the art: no CSS scaffold. */
  art?: CosmeticArtFileRef | null;
  className?: string;
}) {
  const cssArt = `cfa-${slug}`;

  /*
   * A Rive cosmetic draws itself. The preview shows it on the shape it
   * will dress - a circle for the things worn on a picture, a card for
   * the things worn on a card, a wide panel for the rest - so the
   * console judges it at the proportions it will actually ship at.
   */
  if (art) {
    const shape =
      kind === "ring" || kind === "aura"
        ? "size-[84px] overflow-hidden rounded-full"
        : kind === "border" || kind === "animation" || kind === "pattern"
          ? "mx-auto aspect-[63/88] w-24 overflow-hidden rounded-[10px]"
          : "aspect-[16/7] w-full overflow-hidden rounded-[var(--radius-control)]";

    return (
      <div className={cn("grid place-items-center", className)}>
        <div className={cn(shape, "bg-canvas")}>
          <CosmeticFilm
            art={art}
            fit={kind === "ring" || kind === "aura" ? "contain" : "cover"}
          />
        </div>
      </div>
    );
  }

  if (kind === "ring") {
    return (
      <div className={cn("grid place-items-center", className)}>
        <div className={cn("cfx-ring", cssArt)}>
          <span className="cfx-ring-fx" aria-hidden="true" />
          <span className="cfx-ring-band" aria-hidden="true" />
          <span className="cfx-ring-core" aria-hidden="true" />
        </div>
      </div>
    );
  }

  /* An aura is particles around a core and NO band - the preview must
     not show a circle the cosmetic will not draw. */
  if (kind === "aura") {
    return (
      <div className={cn("grid place-items-center", className)}>
        <div className={cn("cfx-aura", cssArt)}>
          <span className="cfx-ring-core" aria-hidden="true" />
          <span className="cfx-aura-fx" aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (kind === "border" || kind === "animation" || kind === "pattern") {
    return (
      <div className={cn("mx-auto w-24", className)}>
        <div className={cn("cfx-card", cssArt)}>
          <div className="cfx-card-face">
            <span className="cfx-card-fx" aria-hidden="true" />
          </div>
        </div>
      </div>
    );
  }

  if (kind === "background") {
    return <div className={cn("cfx-panel", cssArt, className)} />;
  }

  if (kind === "scene") {
    return (
      <div className={cn("cfx-panel", cssArt, className)}>
        <div className="cfx-panel-profile" aria-hidden="true" />
        <span className="cfx-panel-fx" aria-hidden="true" />
      </div>
    );
  }

  if (kind === "nameplate") {
    return (
      <div className={cn("grid min-h-20 place-items-center", className)}>
        <span className={cn("cfx-name", cssArt)}>CHUNC</span>
      </div>
    );
  }

  if (kind === "title") {
    return (
      <div
        className={cn(
          "flex min-h-20 flex-col items-center justify-center gap-1.5",
          className,
        )}
      >
        <span className="cfx-name" style={{ fontSize: 16 }}>
          CHUNC
        </span>
        <span className={cn("cfx-title-chip", cssArt)}>
          {TITLE_SAMPLES[slug] ?? "Title"}
        </span>
      </div>
    );
  }

  if (kind === "badge") {
    return (
      <div className={cn("flex min-h-20 items-center justify-center gap-2", className)}>
        <span className="cfx-name" style={{ fontSize: 16 }}>
          CHUNC
        </span>
        <span className={cn("cfx-badge", cssArt)}>{BADGE_MARKS[slug] ?? "✦"}</span>
      </div>
    );
  }

  return null;
}

/** What each title reads in preview - the real one carries real words. */
const TITLE_SAMPLES: Record<string, string> = {
  "title-custom-tagline": "Your line here",
  "title-trade-milestone": "128 trades",
  "title-collector": "Collector",
  "title-closer": "Closer",
  "title-regular": "Regular",
};

/** The mark inside each badge chip. */
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
