"use client";

import { useEffect, useState } from "react";

import { ART_EVENT, shownArtVariants, VARIANT_EVENT } from "./card-art-carousel";
import { ChevronDown, TrendingDown, TrendingUp } from "lucide-react";

import {
  formatChange,
  formatPrice,
  PRICE_SOURCE,
  type CardPrices,
} from "@/lib/cards/price-shape";
import { cn } from "@/lib/cn";

/**
 * MARKET PRICE, on a card's page, kept quiet: the founder (2026-11-25),
 * "kind of too much info ... cleaner overall." The price of the art on
 * show (the carousel names the printing, so no chips repeat it) large
 * with the week's move, the range in one muted line, and everything
 * else - each condition, each grade - folded under "All prices". No
 * box: it sits on the page like a post. Chips come back only when the
 * art on show has two priced printings (a foil and a normal sharing a
 * picture). The app's card sheet draws the same (mobile/src/card-prices.tsx).
 */
export function CardPricesPanel({ prices }: { prices: CardPrices }) {
  const [at, setAt] = useState(0);
  /* The variants of the art on show; null before the carousel says. */
  const [artVariants, setArtVariants] = useState<string[] | null>(null);

  /* Follow the art carousel: the printing of the art on show
     (card-art-carousel.tsx). */
  useEffect(() => {
    if (prices.state !== "ok") return;
    const onArt = (event: Event) => {
      const variants = (event as CustomEvent<string[]>).detail ?? [];
      setArtVariants(variants.length > 0 ? variants : null);
      const index = prices.printings.findIndex((printing) =>
        variants.includes(printing.variant),
      );
      if (index >= 0) setAt(index);
    };
    /* The carousel may have said so before this panel streamed in. */
    if (shownArtVariants?.length) {
      onArt(new CustomEvent(ART_EVENT, { detail: shownArtVariants }));
    }
    window.addEventListener(ART_EVENT, onArt);
    return () => window.removeEventListener(ART_EVENT, onArt);
  }, [prices]);

  if (prices.state !== "ok") {
    return (
      <PricesFrame>
        <p className="text-sm text-text-muted">
          {prices.state === "none"
            ? "No market price for this card yet."
            : "Prices aren't available right now."}
        </p>
      </PricesFrame>
    );
  }

  const printing = prices.printings[Math.min(at, prices.printings.length - 1)];
  /* The printings the toggle offers: those of the art on show. */
  const choices = prices.printings
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !artVariants || artVariants.includes(entry.variant));
  /* Near mint leads; a printing sold only graded leads with its top grade. */
  const top = printing.graded[0];
  const headline =
    printing.market !== null
      ? { value: printing.market, caption: null }
      : {
          value: top?.market ?? 0,
          caption: top ? `${top.company} ${top.grade}` : null,
        };
  const change = formatChange(printing.change7);
  const up = (printing.change7 ?? 0) > 0;
  const range =
    printing.low !== null && printing.high !== null
      ? `${formatPrice(printing.low, printing.currency)} – ${formatPrice(printing.high, printing.currency)}`
      : null;
  const more = printing.conditions.length > 1 || printing.graded.length > 0;

  return (
    <PricesFrame>
      {choices.length > 1 && (
        <div className="flex gap-1.5" role="tablist">
          {choices.map(({ entry, index }) => (
            <button
              key={entry.variant}
              type="button"
              role="tab"
              aria-selected={index === at}
              onClick={() => {
                setAt(index);
                window.dispatchEvent(
                  new CustomEvent(VARIANT_EVENT, { detail: entry.variant }),
                );
              }}
              className={cn(
                "cursor-pointer rounded-full px-3 py-1 text-xs font-bold transition-colors",
                index === at
                  ? "bg-text-primary text-canvas"
                  : "bg-elevated text-text-secondary hover:text-text-primary",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-display text-3xl font-extrabold tracking-tight text-text-primary tabular-nums">
            {formatPrice(headline.value, printing.currency)}
          </span>
          {headline.caption && (
            <span className="text-sm font-semibold text-text-secondary">
              {headline.caption}
            </span>
          )}
          {change && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-sm font-bold",
                up ? "text-accent" : "text-danger",
              )}
            >
              {up ? (
                <TrendingUp className="size-4" aria-hidden="true" />
              ) : (
                <TrendingDown className="size-4" aria-hidden="true" />
              )}
              {change}
              <span className="font-semibold text-text-muted">7d</span>
            </span>
          )}
        </div>
        <p className="text-sm text-text-muted">
          {printing.market !== null ? "Near mint" : "No ungraded sales"}
          {range && ` · ${range}`}
        </p>
      </div>

      {more && (
        <details className="group border-t border-border">
          <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-sm font-semibold text-text-secondary hover:text-text-primary [&::-webkit-details-marker]:hidden">
            All prices
            <ChevronDown
              className="size-4 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="flex flex-col gap-4 pb-3">
            {printing.conditions.length > 1 && (
              <PriceList label="By condition">
                {printing.conditions.map((entry) => (
                  <PriceRow
                    key={entry.condition}
                    name={entry.condition}
                    value={formatPrice(entry.market, printing.currency)}
                  />
                ))}
              </PriceList>
            )}
            {printing.graded.length > 0 && (
              <PriceList label="Graded">
                {printing.graded.map((entry) => (
                  <PriceRow
                    key={`${entry.company}-${entry.grade}`}
                    name={`${entry.company} ${entry.grade}`}
                    value={formatPrice(entry.market, printing.currency)}
                  />
                ))}
              </PriceList>
            )}
          </div>
        </details>
      )}

      <p
        className={cn(
          "text-xs text-text-muted",
          !more && "border-t border-border pt-3",
        )}
      >
        {PRICE_SOURCE} · updated {updatedLabel(prices.fetchedAt)}
      </p>
    </PricesFrame>
  );
}

/** The section and its heading, the same as every other on the page. */
export function PricesFrame({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-labelledby="card-prices">
      <h2
        id="card-prices"
        className="text-xs font-semibold tracking-[0.14em] text-text-muted uppercase"
      >
        Market price
      </h2>
      {children}
    </section>
  );
}

/**
 * While the prices load: the panel's own shape - the price, the range,
 * the "All prices" row - so nothing below it moves when the figures
 * land. The app's placeholder is the same.
 */
export function CardPricesSkeleton() {
  return (
    <PricesFrame>
      <div className="flex flex-col gap-1.5">
        <span className="h-9 w-32 animate-pulse rounded-md bg-elevated" />
        <span className="h-4 w-44 animate-pulse rounded-md bg-elevated" />
      </div>
      <div className="flex items-center justify-between border-t border-border py-3">
        <span className="h-4 w-20 rounded bg-elevated" />
      </div>
      <span className="h-3 w-48 rounded bg-elevated" />
    </PricesFrame>
  );
}

function PriceList({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] font-semibold tracking-[0.12em] text-text-muted uppercase">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-x-6">{children}</div>
    </div>
  );
}

function PriceRow({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1 text-sm">
      <span className="text-text-secondary">{name}</span>
      <span className="font-semibold text-text-primary tabular-nums">{value}</span>
    </div>
  );
}

/** "2h ago", "just now": how fresh the figures are. */
function updatedLabel(iso: string): string {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 60000),
  );
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}
