/**
 * The scanner bench's arithmetic: how a run did against the admin's
 * labelled answer, and the totals across every labelled photo.
 *
 * The founder (2026-10-13): "Do not claim accuracy improvements without
 * measuring them against labeled test data." So nothing here guesses: a
 * benchmark without a labelled answer counts for cost and time only, and
 * every share is over the pockets that were actually labelled.
 *
 * Pure: no server in it, every rule unit-tested.
 */

export type BenchMode = "anthropic" | "openai" | "hybrid";
export const BENCH_MODES: readonly BenchMode[] = ["anthropic", "openai", "hybrid"];

/** What one mode said about one pocket, as much as the bench keeps. */
export interface BenchPocket {
  slot: number;
  status: "matched" | "ambiguous" | "unrecognized" | "empty";
  cardId: string | null;
  printingId: string | null;
  name: string;
  number: string;
}

/** One mode's run on one photo. */
export interface BenchRun {
  mode: BenchMode;
  ok: boolean;
  /** Why it did not run or failed: "no-key", "unavailable", "timeout". */
  reason: string | null;
  ms: number;
  cents: number;
  input: number;
  output: number;
  calls: number;
  escalated: number;
  pockets: BenchPocket[];
}

/** The right answer for one pocket, set by the admin. */
export interface BenchTruth {
  slot: number;
  empty: boolean;
  cardId: string | null;
  /** Null when the admin did not say which printing. */
  printingId: string | null;
}

export interface RunScore {
  /** Pockets labelled with a card, and how many the run named exactly. */
  cards: number;
  exact: number;
  /** Labelled printings, and how many the run named exactly. */
  printings: number;
  printingRight: number;
  /** Labelled cards the run found anywhere on the page, and how many in the right pocket. */
  found: number;
  placedRight: number;
  /** Pockets labelled, and how many the run got right on empty or not. */
  pockets: number;
  emptyRight: number;
}

/** How one run did against the labelled answer. */
export function scoreRun(
  run: Pick<BenchRun, "pockets">,
  truth: readonly BenchTruth[],
): RunScore {
  const score: RunScore = {
    cards: 0,
    exact: 0,
    printings: 0,
    printingRight: 0,
    found: 0,
    placedRight: 0,
    pockets: 0,
    emptyRight: 0,
  };
  const bySlot = new Map(run.pockets.map((p) => [p.slot, p]));
  for (const answer of truth) {
    const said = bySlot.get(answer.slot);
    score.pockets += 1;
    const saidEmpty = !said || said.status === "empty";
    if (saidEmpty === answer.empty) score.emptyRight += 1;
    if (answer.empty || !answer.cardId) continue;

    score.cards += 1;
    const right = said?.cardId === answer.cardId;
    if (right) score.exact += 1;
    if (answer.printingId) {
      score.printings += 1;
      if (right && said?.printingId === answer.printingId) score.printingRight += 1;
    }
    if (run.pockets.some((p) => p.cardId === answer.cardId)) {
      score.found += 1;
      if (right) score.placedRight += 1;
    }
  }
  return score;
}

export interface ModeTotals {
  mode: BenchMode;
  /** Photos this mode ran on, and how many of those were labelled. */
  photos: number;
  labelled: number;
  /** Shares from 0 to 1, or null when nothing labelled could say. */
  exactCard: number | null;
  exactPrinting: number | null;
  placement: number | null;
  emptyDetection: number | null;
  /** Averages over every photo it ran on, labelled or not. */
  averageCents: number | null;
  averageMs: number | null;
}

const share = (part: number, whole: number) => (whole > 0 ? part / whole : null);

/** Every mode's totals across the bench. */
export function benchTotals(
  benchmarks: readonly {
    runs: Partial<Record<BenchMode, BenchRun>>;
    truth: readonly BenchTruth[] | null;
  }[],
): ModeTotals[] {
  return BENCH_MODES.map((mode) => {
    const ran = benchmarks.flatMap((b) => {
      const run = b.runs[mode];
      return run && run.ok ? [{ run, truth: b.truth }] : [];
    });
    const sum: RunScore = {
      cards: 0,
      exact: 0,
      printings: 0,
      printingRight: 0,
      found: 0,
      placedRight: 0,
      pockets: 0,
      emptyRight: 0,
    };
    let labelled = 0;
    for (const { run, truth } of ran) {
      if (!truth || truth.length === 0) continue;
      labelled += 1;
      const one = scoreRun(run, truth);
      for (const key of Object.keys(sum) as (keyof RunScore)[]) sum[key] += one[key];
    }
    return {
      mode,
      photos: ran.length,
      labelled,
      exactCard: share(sum.exact, sum.cards),
      exactPrinting: share(sum.printingRight, sum.printings),
      placement: share(sum.placedRight, sum.found),
      emptyDetection: share(sum.emptyRight, sum.pockets),
      averageCents:
        ran.length > 0 ? ran.reduce((t, r) => t + r.run.cents, 0) / ran.length : null,
      averageMs:
        ran.length > 0 ? ran.reduce((t, r) => t + r.run.ms, 0) / ran.length : null,
    };
  });
}

/** The live scanner's numbers by mode, from its run log. */
export interface LiveTotals {
  mode: string;
  pages: number;
  averageCents: number;
  averageMs: number;
  /** Shares of the pockets that held a card. */
  matched: number;
  review: number;
  unrecognized: number;
  /** Pockets the players changed before placing, over the pockets placed pages held; null before any page is placed. */
  correctionRate: number | null;
}

export function liveTotals(
  rows: readonly {
    mode: string;
    cents: number;
    ms: number;
    matched: number;
    review: number;
    unrecognized: number;
    corrections: number | null;
  }[],
): LiveTotals[] {
  const byMode = new Map<string, typeof rows>();
  for (const row of rows) byMode.set(row.mode, [...(byMode.get(row.mode) ?? []), row]);
  return [...byMode].map(([mode, list]) => {
    const cards = list.reduce((t, r) => t + r.matched + r.review + r.unrecognized, 0);
    const placed = list.filter((r) => r.corrections !== null);
    const placedCards = placed.reduce(
      (t, r) => t + r.matched + r.review + r.unrecognized,
      0,
    );
    return {
      mode,
      pages: list.length,
      averageCents: list.reduce((t, r) => t + Number(r.cents), 0) / list.length,
      averageMs: list.reduce((t, r) => t + r.ms, 0) / list.length,
      matched: cards > 0 ? list.reduce((t, r) => t + r.matched, 0) / cards : 0,
      review: cards > 0 ? list.reduce((t, r) => t + r.review, 0) / cards : 0,
      unrecognized:
        cards > 0 ? list.reduce((t, r) => t + r.unrecognized, 0) / cards : 0,
      correctionRate:
        placedCards > 0
          ? placed.reduce((t, r) => t + (r.corrections ?? 0), 0) / placedCards
          : null,
    };
  });
}
