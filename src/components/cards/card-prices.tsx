"use client";

import { useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

import {
  formatChange,
  formatPrice,
  PRICE_SOURCE,
  type CardPrices,
} from "@/lib/cards/price-shape";
import { cn } from "@/lib/cn";

/**
 * MARKET PRICE, on a card's page: one printing at a time, its near-mint
 * price large with the week's move beside it, the range under it, then
 * the other conditions and the top graded prices as small chips. The
 * app's card screen draws the same (mobile/src/card-prices.tsx).
 */
export function CardPricesPanel({ prices }: { prices: CardPrices }) {
  const [at, setAt] = useState(0);

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

  return (
    <PricesFrame>
      {prices.printings.length > 1 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
          {prices.printings.map((entry, index) => (
            <button
              key={entry.variant}
              type="button"
              role="tab"
              aria-selected={index === at}
              onClick={() => setAt(index)}
              className={cn(
                "shrink-0 cursor-pointer rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
                index === at
                  ? "border-accent bg-accent text-accent-contrast"
                  : "border-border bg-surface text-text-primary hover:border-border-strong",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-border bg-elevated/60 p-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-3xl font-extrabold tracking-tight text-text-primary">
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
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold",
                up ? "bg-accent/15 text-accent" : "bg-danger/15 text-danger",
              )}
            >
              {up ? (
                <TrendingUp className="size-3.5" aria-hidden="true" />
              ) : (
                <TrendingDown className="size-3.5" aria-hidden="true" />
              )}
              {change} · 7d
            </span>
          )}
        </div>
        <p className="text-sm text-text-secondary">
          {printing.market !== null ? "Near mint" : "No ungraded sales"}
          {printing.low !== null &&
            ` · Low ${formatPrice(printing.low, printing.currency)}`}
          {printing.high !== null &&
            ` · High ${formatPrice(printing.high, printing.currency)}`}
        </p>

        {printing.conditions.length > 1 && (
          <Chips label="By condition">
            {printing.conditions.map((entry) => (
              <Chip
                key={entry.condition}
                name={entry.condition}
                value={formatPrice(entry.market, printing.currency)}
              />
            ))}
          </Chips>
        )}

        {printing.graded.length > 0 && (
          <Chips label="Graded">
            {printing.graded.map((entry) => (
              <Chip
                key={`${entry.company}-${entry.grade}`}
                name={`${entry.company} ${entry.grade}`}
                value={formatPrice(entry.market, printing.currency)}
              />
            ))}
          </Chips>
        )}
      </div>

      <p className="text-xs text-text-muted">
        {PRICE_SOURCE} Updated {updatedLabel(prices.fetchedAt)}.
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
 * While the prices load: the panel's own shape and size - the chips,
 * the price, the range, two rows of chips - so nothing below it moves
 * when the figures land. The app's placeholder is the same.
 */
export function CardPricesSkeleton() {
  const pills = (
    <div className="flex flex-wrap gap-2">
      {[0, 1, 2, 3].map((index) => (
        <span key={index} className="h-7 w-20 animate-pulse rounded-full bg-elevated" />
      ))}
    </div>
  );
  return (
    <PricesFrame>
      <div className="flex gap-2 pb-1">
        {["w-16", "w-24", "w-32"].map((width) => (
          <span
            key={width}
            className={`h-8 ${width} animate-pulse rounded-full bg-elevated`}
          />
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-border bg-elevated/60 p-4">
        <span className="h-9 w-32 animate-pulse rounded-md bg-elevated" />
        <span className="h-4 w-56 animate-pulse rounded-md bg-elevated" />
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <span className="h-3 w-24 rounded bg-elevated" />
          {pills}
        </div>
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <span className="h-3 w-16 rounded bg-elevated" />
          {pills}
        </div>
      </div>
      <span className="h-3 w-64 rounded bg-elevated" />
    </PricesFrame>
  );
}

function Chips({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-3">
      <p className="text-[11px] font-semibold tracking-[0.12em] text-text-muted uppercase">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ name, value }: { name: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-sm">
      <span className="font-semibold text-text-secondary">{name}</span>
      <span className="font-bold text-text-primary tabular-nums">{value}</span>
    </span>
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
