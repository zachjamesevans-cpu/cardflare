import { Radio } from "lucide-react";

import {
  CardTile,
  PLACES,
  PLACE_ORDER,
  SAMPLE_CARD,
} from "@/components/marketing/places";
import { cn } from "@/lib/cn";

/**
 * The product, shown once: one wanted card, and where it is.
 *
 * The founder: "one of the most visually important parts of the
 * homepage... the reaction I want is 'oh, cardflare tells me where the
 * card is.'" So this is a screen, not three cards of copy: the Want
 * List row at the top, and under it the three results the app would
 * show, each in the colour of its place with the thing you do next.
 * Directly under the hero, and on a phone it is the first picture.
 */
export function ThreePlaces() {
  return (
    <section
      aria-labelledby="three-places-title"
      className="px-5 pt-2 pb-12 sm:px-6 md:pt-6 md:pb-20"
    >
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
            One Want List
          </p>
          <h2
            id="three-places-title"
            className="text-2xl font-bold tracking-tight text-balance text-text-primary sm:text-4xl"
          >
            cardflare tells you where the card is.
          </h2>
        </div>

        <div className="mt-6 overflow-hidden rounded-[var(--radius-panel)] border border-border bg-surface shadow-[var(--shadow-panel)] md:mt-8">
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
            <span className="shrink-0 rounded-full bg-accent/15 px-2.5 py-1 text-[10px] font-bold tracking-wider text-accent uppercase">
              3 found
            </span>
          </div>

          {/* The three answers. */}
          <ul className="divide-y divide-border">
            {PLACE_ORDER.map((place, index) => {
              const p = PLACES[place];
              return (
                <li
                  key={place}
                  className="flex items-center gap-3 px-4 py-3.5 sm:gap-4"
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full bg-elevated sm:size-11",
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
                    <p className="text-[15px] leading-tight font-bold text-text-primary sm:text-lg">
                      {p.line}
                    </p>
                    <p className="truncate text-xs text-text-muted sm:text-sm">
                      {p.detail}
                    </p>
                  </div>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "shrink-0 rounded-[var(--radius-control)] px-2.5 py-1.5 text-[11px] font-semibold sm:px-3 sm:py-2 sm:text-sm",
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
      </div>
    </section>
  );
}
