/**
 * Card prices, shaped for the card page: Scrydex's market data per
 * printing, cut down to what a person trading at a table needs.
 *
 * The founder (2026-11-25): "integrate the pricing information for each
 * card into cardflare. make it a clean UI." This replaces the old rule
 * that cardflare shows no prices (PRODUCT.md): prices are Scrydex's
 * market figures, read-only, for reference - cardflare still sells
 * nothing and takes no cut of a trade.
 *
 * No server code here, so tests read it and the app mirrors its words
 * (mobile/src/price-copy.ts).
 */

/** One raw (ungraded) price in a condition. */
export interface ConditionPrice {
  condition: string;
  market: number;
}

/** One graded price: "PSA 10". */
export interface GradedPrice {
  company: string;
  grade: string;
  market: number;
}

/** A printing's prices: the near-mint figure leads, the rest under it. */
export interface PrintingPrices {
  /** Our card_printings id, when this variant is one we imported. */
  printingId: string | null;
  /** Scrydex's variant name: "normal", "foil", "altArt". */
  variant: string;
  /** For people: "Normal", "Foil", "Alt Art". */
  label: string;
  currency: string;
  /** Near mint, raw: what "the price" of a card means at a table. */
  market: number | null;
  low: number | null;
  high: number | null;
  /** Percent change over seven days, near mint. */
  change7: number | null;
  conditions: ConditionPrice[];
  graded: GradedPrice[];
}

export type CardPrices =
  | { state: "ok"; printings: PrintingPrices[]; fetchedAt: string }
  /** The card has no market data (a new set, a promo nobody sells). */
  | { state: "none" }
  /** Scrydex could not be reached; the page says so and moves on. */
  | { state: "unavailable" };

/** Raw conditions, best first, the order a seller lists them. */
export const CONDITIONS = ["NM", "LP", "MP", "HP", "DM"] as const;

/** Graders in the order collectors look for them. */
const GRADERS = ["PSA", "BGS", "CGC", "TAG", "SGC", "ACE"];

/** A perfect grade's own name, by grader. */
const PERFECT: Record<string, string> = { BGS: "Black Label", CGC: "Pristine 10" };

/** How many graded prices a printing shows: the top few, not a table. */
export const GRADED_SHOWN = 4;

/** "altArt" -> "Alt Art". Mirrors the adapter's printing labels. */
export function variantName(variant: string): string {
  return variant
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (first) => first.toUpperCase());
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Scrydex's variants (with `include=prices`) as the card page's
 * printings. `printingIds` maps a variant name to our printing id.
 * A variant with no price at all is left out; a card whose variants
 * all have none is `{ state: "none" }`.
 */
export function shapePrices(
  variants: unknown,
  printingIds: ReadonlyMap<string, string>,
  fetchedAt: string,
): CardPrices {
  if (!Array.isArray(variants)) return { state: "none" };

  const printings: PrintingPrices[] = [];
  for (const entry of variants) {
    const variant = record(entry);
    const name = typeof variant?.name === "string" ? variant.name : null;
    const prices = Array.isArray(variant?.prices) ? variant.prices.map(record) : [];
    if (!name || prices.length === 0) continue;

    const raw = prices.filter((price) => price?.type === "raw");
    const nm = raw.find((price) => price?.condition === "NM") ?? null;
    const trend = record(record(nm?.trends)?.days_7);
    const currency = String(nm?.currency ?? prices[0]?.currency ?? "USD");

    const conditions: ConditionPrice[] = CONDITIONS.flatMap((condition) => {
      const market = num(raw.find((price) => price?.condition === condition)?.market);
      return market === null ? [] : [{ condition, market }];
    });

    const graded: GradedPrice[] = prices
      .filter((price) => price?.type === "graded")
      .flatMap((price) => {
        const market = num(price?.market);
        const company = typeof price?.company === "string" ? price.company : null;
        const grade = typeof price?.grade === "string" ? price.grade : null;
        if (market === null || !company || !grade) return [];
        if (price?.is_signed === true || price?.is_error === true) return [];
        /* A perfect 10 is its own tier with its own name: BGS's Black
           Label, CGC's Pristine. Otherwise "BGS 10" would show twice. */
        const perfect = price?.is_perfect === true;
        const tier = perfect ? (PERFECT[company] ?? `${grade} Perfect`) : grade;
        return [{ company, grade: tier, market }];
      })
      .filter(
        (entry, index, all) =>
          all.findIndex(
            (other) => other.company === entry.company && other.grade === entry.grade,
          ) === index,
      )
      .sort((a, b) => {
        /* A named perfect tier ranks above a plain 10. */
        const value = (grade: string) => Number.parseFloat(grade) || 10.5;
        const byGrade = value(b.grade) - value(a.grade);
        if (byGrade !== 0) return byGrade;
        const rank = (company: string) => {
          const at = GRADERS.indexOf(company);
          return at === -1 ? GRADERS.length : at;
        };
        return rank(a.company) - rank(b.company);
      })
      .slice(0, GRADED_SHOWN);

    if (conditions.length === 0 && graded.length === 0) continue;

    printings.push({
      printingId: printingIds.get(name) ?? null,
      variant: name,
      label: variantName(name),
      currency,
      market: num(nm?.market),
      low: num(nm?.low),
      high: num(nm?.high),
      change7: typeof trend?.percent_change === "number" ? trend.percent_change : null,
      conditions,
      graded,
    });
  }

  if (printings.length === 0) return { state: "none" };

  /* The card as first printed leads: its normal print, then its own
     foil or holo finish, then reprints, then alternate arts, each group
     cheapest first. */
  const group = (printing: PrintingPrices) => {
    if (printing.variant === "normal") return 0;
    if (/alt|manga|serialized|special|premium/i.test(printing.variant)) return 3;
    if (/reprint/i.test(printing.variant)) return 2;
    return 1;
  };
  printings.sort(
    (a, b) =>
      group(a) - group(b) ||
      (a.market ?? Number.POSITIVE_INFINITY) - (b.market ?? Number.POSITIVE_INFINITY),
  );
  return { state: "ok", printings, fetchedAt };
}

/** "$6.13", "$3,998.74", "$0.25". */
export function formatPrice(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** "+2.9%", "−2.9%", or null for no change worth saying. */
export function formatChange(percent: number | null): string | null {
  if (percent === null || Math.abs(percent) < 0.05) return null;
  const sign = percent > 0 ? "+" : "−";
  return `${sign}${Math.abs(percent).toFixed(1)}%`;
}

/** The line under the prices: where they come from, and how fresh. */
export const PRICE_SOURCE = "Prices from Scrydex";
