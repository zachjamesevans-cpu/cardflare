import { Radio } from "lucide-react";

import {
  CardTile,
  PLACES,
  PLACE_ORDER,
  SAMPLE_CARD,
} from "@/components/marketing/places";
import { cn } from "@/lib/cn";

/**
 * The product, on the first screen: one wanted card, and where it is.
 *
 * The founder: "I tell cardflare what card I want, and it helps me find
 * where it is" should be obvious before the first scroll, and the
 * visual should "feel like an actual cardflare product result, not a
 * generic marketing diagram." So this is drawn as the app draws a
 * Flare: the want at the top with its card, then the three matches
 * underneath in the colour of their place, each with the thing you do
 * next. It sits beside the headline on desktop and directly under the
 * buttons on a phone, and there is no second copy of it on the page.
 */
export function FoundPanel({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="A Want List entry for Monkey D. Luffy with three matches: Alex has it 2.1 miles away, the local store may have it, and vendor 81 at booth 174 has a PSA 9."
      className={cn(
        "overflow-hidden rounded-[var(--radius-panel)] border border-border bg-surface shadow-[var(--shadow-panel)]",
        className,
      )}
    >
      {/* The want. */}
      <div className="flex items-center gap-3 border-b border-border bg-elevated/60 px-4 py-3">
        <CardTile size="sm" className="w-9" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.16em] text-text-muted uppercase">
            <Radio className="size-3 text-accent" aria-hidden="true" />
            Want List
          </p>
          <p className="truncate text-base font-bold text-text-primary">
            {SAMPLE_CARD.name}{" "}
            <span className="hidden font-normal text-text-muted sm:inline">
              {SAMPLE_CARD.set}
            </span>
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[10px] font-bold tracking-wider text-accent uppercase">
          <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />3 found
        </span>
      </div>

      {/* The three answers, each in its place's colour. */}
      <ul className="divide-y divide-border">
        {PLACE_ORDER.map((place, index) => {
          const p = PLACES[place];
          return (
            <li key={place} className="flex items-center gap-3 px-4 py-3 sm:gap-4">
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full bg-elevated",
                  p.tone,
                )}
              >
                <p.icon className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-[10px] font-bold tracking-[0.16em] uppercase",
                    p.tone,
                  )}
                >
                  {p.eyebrow}
                </p>
                <p className="text-[15px] leading-tight font-bold text-text-primary sm:text-base">
                  {p.line}
                </p>
                <p className="text-xs text-text-muted">{p.detail}</p>
              </div>
              <span
                aria-hidden="true"
                className={cn(
                  "shrink-0 rounded-[var(--radius-control)] px-2.5 py-1.5 text-[11px] font-semibold sm:px-3 sm:text-xs",
                  index === 0
                    ? "bg-accent text-accent-contrast"
                    : "border border-border bg-elevated text-text-primary",
                )}
              >
                {p.action}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
