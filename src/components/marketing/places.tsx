import { MapPin, Sparkles, Store, Tent, type LucideIcon } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * The three places a card turns up, and the pieces every homepage
 * section builds from.
 *
 * The founder's brief for the homepage: "CardFlare should immediately
 * communicate that it can help users find cards nearby, at their LGS,
 * at tournaments, at card shows", and "the goal is for someone to
 * instantly understand: oh, cardflare tells me where the card is."
 * So one card, three answers, said the same way everywhere on the
 * page: in the hero, in the strip under it, on the phone.
 */

export type Place = "nearby" | "lgs" | "show";

export interface PlaceFacts {
  /** The small capitals: NEARBY, AT YOUR LGS, AT THE SHOW. */
  eyebrow: string;
  /** The answer: "Someone nearby has it". */
  line: string;
  /** The sample detail under it. Illustrative, never live data. */
  detail: string;
  /** What the person does next. */
  action: string;
  icon: LucideIcon;
  /** The text colour token for this place. */
  tone: string;
}

export const PLACES: Record<Place, PlaceFacts> = {
  nearby: {
    eyebrow: "Nearby",
    line: "Someone nearby has it",
    detail: "Kaito · 0.4 mi · 2 available",
    action: "Raise a hand",
    icon: MapPin,
    tone: "text-accent",
  },
  lgs: {
    eyebrow: "At your LGS",
    line: "Store may have it",
    detail: "Grand Line Games · counter",
    action: "Ask the counter",
    icon: Store,
    tone: "text-frost",
  },
  show: {
    eyebrow: "At the show",
    line: "Vendor booth may have it",
    detail: "Booth 42 · PSA 9 · $38",
    action: "Walk to booth 42",
    icon: Tent,
    tone: "text-gold",
  },
};

export const PLACE_ORDER: readonly Place[] = ["nearby", "lgs", "show"];

/** The sample card the page keeps finding. */
export const SAMPLE_CARD = { name: "Monkey D. Luffy", set: "OP01-003 · Leader" };

/**
 * A stylised card, ours. No third-party card art appears anywhere on
 * the marketing site, so the tile is a shape in the brand's colours
 * with the sample card's name on it.
 */
export function CardTile({
  size = "md",
  className,
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  const dims = size === "sm" ? "w-16" : "w-28 sm:w-32";
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative aspect-[5/7] shrink-0 overflow-hidden rounded-[10px] border border-game-one-piece/60 bg-gradient-to-br from-galaxy/40 via-elevated to-game-one-piece/30 shadow-[0_30px_60px_-30px_var(--color-canvas)]",
        dims,
        className,
      )}
    >
      <div className="absolute inset-[6%] rounded-[6px] border border-text-primary/10 bg-gradient-to-b from-text-primary/5 to-transparent" />
      <div className="absolute inset-x-0 top-[14%] flex justify-center">
        <Sparkles className={cn("text-accent", size === "sm" ? "size-5" : "size-8")} />
      </div>
      {size === "md" && (
        <div className="absolute inset-x-0 bottom-0 bg-canvas/70 px-2 py-1.5 backdrop-blur">
          <p className="truncate text-[11px] font-bold text-text-primary">
            {SAMPLE_CARD.name}
          </p>
          <p className="truncate text-[10px] text-text-muted">{SAMPLE_CARD.set}</p>
        </div>
      )}
      {/* One diagonal sheen, so the tile reads as a foil rather than a
          flat rectangle. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-text-primary/10 to-transparent" />
    </div>
  );
}

/** One answer, as a chip: icon, place, and the line. */
export function PlaceChip({
  place,
  compact = false,
  className,
}: {
  place: Place;
  /** Eyebrow and line only; the detail is left off. */
  compact?: boolean;
  className?: string;
}) {
  const p = PLACES[place];
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-control)] border border-border bg-surface/95 px-3 py-2.5 shadow-[var(--shadow-panel)] backdrop-blur",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full bg-elevated",
          p.tone,
        )}
      >
        <p.icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className={cn("text-[10px] font-bold tracking-[0.16em] uppercase", p.tone)}>
          {p.eyebrow}
        </p>
        <p className="truncate text-sm font-semibold text-text-primary">{p.line}</p>
        {!compact && <p className="truncate text-xs text-text-muted">{p.detail}</p>}
      </div>
    </div>
  );
}

/**
 * The two doors in, used by the hero and again at the foot of the page.
 * Players get an account now; stores and vendors get the Ultra pitch,
 * which links on to Max for show vendors.
 */
export function HeroCtas({
  className,
  analyticsEvent,
}: {
  className?: string;
  /** The primary button's analytics name. */
  analyticsEvent: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center",
        className,
      )}
    >
      <ButtonLink
        href="/signup"
        size="lg"
        className="w-full sm:w-auto"
        data-analytics-event={analyticsEvent}
      >
        Create free account
      </ButtonLink>
      <ButtonLink
        href="/ultra"
        variant="secondary"
        size="lg"
        className="w-full sm:w-auto"
      >
        For stores &amp; vendors
      </ButtonLink>
    </div>
  );
}
