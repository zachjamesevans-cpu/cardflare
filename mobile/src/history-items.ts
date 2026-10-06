/**
 * History, one list of two things: the trades you made and the Flares
 * that finished. The founder, on the greyed-out "FOUND" rows: "past
 * flares should live somewhere, or a flare history of sorts... it could
 * be cool to see a log of who answered the flare, date and time etc."
 *
 * No React here and no imports at all, not even api.ts's types: the
 * website's unit tests import this file, and api.ts reaches for
 * expo-secure-store, which Vercel's install does not have
 * (tests/unit/mobile-imports.test.ts). The shapes below are the parts
 * of api.ts's entries this file reads.
 */

export type HistoryFilter = "all" | "trades" | "flares";

/** The chips over the list, in order. The website's, word for word. */
export const HISTORY_FILTERS: readonly { key: HistoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "trades", label: "Trades" },
  { key: "flares", label: "Flares" },
];

/** How a past Flare ended, in the row's words. api.ts's FlareOutcome. */
export const FLARE_OUTCOME_LABELS: Record<"found" | "traded" | "taken-down", string> = {
  found: "Found",
  traded: "Traded",
  "taken-down": "Taken down",
};

export type HistoryItem<T, F> =
  { kind: "trade"; at: string; trade: T } | { kind: "flare"; at: string; flare: F };

/**
 * The rows a filter shows, newest first: a trade by when it was
 * confirmed, a Flare by when it ended. "All" merges both by that date.
 */
export function historyItems<
  T extends { confirmedAt: string },
  F extends { endedAt: string },
>(
  filter: HistoryFilter,
  trades: readonly T[],
  flares: readonly F[],
): HistoryItem<T, F>[] {
  const items: HistoryItem<T, F>[] = [
    ...(filter === "flares"
      ? []
      : trades.map((trade) => ({
          kind: "trade" as const,
          at: trade.confirmedAt,
          trade,
        }))),
    ...(filter === "trades"
      ? []
      : flares.map((flare) => ({
          kind: "flare" as const,
          at: flare.endedAt,
          flare,
        }))),
  ];
  const time = (iso: string) => {
    const value = Date.parse(iso);
    return Number.isFinite(value) ? value : 0;
  };
  /* Stable for equal times, so a server's own order survives a tie. */
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => time(b.item.at) - time(a.item.at) || a.index - b.index)
    .map(({ item }) => item);
}

/** One card per month, in the order the items arrive. */
export function groupByMonth<T extends { at: string }>(
  items: readonly T[],
  monthOf: (iso: string) => string,
): { label: string; items: T[] }[] {
  const months: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const label = monthOf(item.at);
    const last = months[months.length - 1];
    if (last && last.label === label) last.items.push(item);
    else months.push({ label, items: [item] });
  }
  return months;
}
