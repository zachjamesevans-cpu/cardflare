import {
  CardTile,
  PLACES,
  PLACE_ORDER,
  SAMPLE_CARD,
} from "@/components/marketing/places";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { cn } from "@/lib/cn";

/**
 * The magic, shown once: the same card, found three ways.
 *
 * Each card is one search result as the app would show it, with the
 * place, the answer, the sample detail and the thing the person does
 * next. Three of them side by side say "one Want List, everywhere"
 * without a paragraph.
 */
export function ThreePlaces() {
  return (
    <Section labelledBy="three-places-title" className="py-14 md:py-20">
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
          One Want List
        </p>
        <h2
          id="three-places-title"
          className="max-w-2xl text-3xl font-bold tracking-tight text-balance text-text-primary sm:text-4xl"
        >
          cardflare searches everywhere.
        </h2>
      </div>

      <ul className="mt-10 grid gap-4 md:grid-cols-3">
        {PLACE_ORDER.map((place, index) => {
          const p = PLACES[place];
          return (
            <Card as="li" key={place} className="flex flex-col gap-4">
              <p
                className={cn(
                  "flex items-center gap-2 text-xs font-bold tracking-[0.16em] uppercase",
                  p.tone,
                )}
              >
                <p.icon className="size-4" aria-hidden="true" />
                {p.eyebrow}
              </p>

              <div className="flex items-center gap-4">
                <CardTile size="sm" />
                <div className="min-w-0">
                  <p className="text-sm text-text-muted">{SAMPLE_CARD.name}</p>
                  <p className="text-lg font-bold text-text-primary">{p.line}</p>
                  <p className="text-sm text-text-muted">{p.detail}</p>
                </div>
              </div>

              <span
                aria-hidden="true"
                className={cn(
                  "self-start rounded-[var(--radius-control)] px-3 py-2 text-sm font-semibold",
                  index === 0
                    ? "bg-accent text-accent-contrast"
                    : "border border-border bg-elevated text-text-primary",
                )}
              >
                {p.action}
              </span>
            </Card>
          );
        })}
      </ul>
    </Section>
  );
}
