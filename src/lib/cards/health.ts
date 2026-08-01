import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * What the catalog actually contains, and what the last sync could not use.
 *
 * Both questions were answerable only by writing SQL against Supabase, which
 * means in practice they went unanswered. "Do not claim complete One Piece
 * coverage unless it has actually been verified" needs somewhere to do the
 * verifying, and a rejected-record table nobody reads is the same as no
 * rejected-record table.
 *
 * Deliberately no new SQL function, so this needs no migration: rows are read
 * and grouped here. Everything is bounded — see PAGE and MAX_ROWS.
 */

/** PostgREST caps a response at 1000 rows regardless of what is asked for. */
const PAGE = 1000;

/**
 * Ceiling on rows pulled for a summary.
 *
 * A summary is not worth an unbounded read. Past this the counts are reported
 * as partial rather than quietly presented as complete.
 */
const MAX_ROWS = 20_000;

const pages = (): number[] =>
  Array.from({ length: MAX_ROWS / PAGE }, (_, i) => i * PAGE);

/* -------------------------------------------------------------------------- */
/* Set coverage                                                               */
/* -------------------------------------------------------------------------- */

export interface SetCoverage {
  /** Rows with no set code are grouped under a label rather than dropped. */
  setCode: string;
  cards: number;
}

/**
 * Distinct cards per set, not printings per set.
 *
 * A card with a base art and an alternate art is one card in the set. Counting
 * printings would overstate every set that has parallels — and this number
 * exists precisely to be compared against an official set list.
 */
export function summariseSets(
  rows: { card_id: string; set_code: string | null }[],
): SetCoverage[] {
  const seen = new Map<string, Set<string>>();

  for (const row of rows) {
    const key = row.set_code ?? "(no set code)";
    const cards = seen.get(key) ?? new Set<string>();
    cards.add(row.card_id);
    seen.set(key, cards);
  }

  return [...seen.entries()]
    .map(([setCode, cards]) => ({ setCode, cards: cards.size }))
    .sort((a, b) => a.setCode.localeCompare(b.setCode));
}

export async function catalogBySet(): Promise<{
  sets: SetCoverage[];
  truncated: boolean;
}> {
  if (!isSupabaseConfigured()) return { sets: [], truncated: false };

  const rows: { card_id: string; set_code: string | null }[] = [];

  for (const from of pages()) {
    const { data, error } = await getSupabaseAdmin()
      .from("card_printings")
      .select("card_id, set_code")
      .range(from, from + PAGE - 1);

    if (error) {
      console.error("Could not read printings for set coverage", error);
      return { sets: summariseSets(rows), truncated: true };
    }

    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE)
      return { sets: summariseSets(rows), truncated: false };
  }

  return { sets: summariseSets(rows), truncated: true };
}

/* -------------------------------------------------------------------------- */
/* Sync failures                                                              */
/* -------------------------------------------------------------------------- */

export interface FailureGroup {
  reason: string;
  count: number;
}

/**
 * Groups rejection reasons, commonest first.
 *
 * A reason carries the offending field and message, so a provider renaming one
 * field produces thousands of identical strings. Grouped, that is one line
 * saying what broke; ungrouped it is a wall that hides the second, rarer
 * problem underneath it.
 */
export function groupFailures(reasons: string[], limit = 8): FailureGroup[] {
  const counts = new Map<string, number>();

  for (const reason of reasons) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, limit);
}

export async function failuresForRun(runId: string): Promise<{
  groups: FailureGroup[];
  total: number;
  truncated: boolean;
}> {
  if (!isSupabaseConfigured()) return { groups: [], total: 0, truncated: false };

  const reasons: string[] = [];

  for (const from of pages()) {
    const { data, error } = await getSupabaseAdmin()
      .from("card_sync_failures")
      .select("reason")
      .eq("run_id", runId)
      .range(from, from + PAGE - 1);

    if (error) {
      console.error("Could not read sync failures", error);
      return { groups: groupFailures(reasons), total: reasons.length, truncated: true };
    }

    reasons.push(...(data ?? []).map((row) => row.reason));
    if ((data?.length ?? 0) < PAGE) {
      return {
        groups: groupFailures(reasons),
        total: reasons.length,
        truncated: false,
      };
    }
  }

  return { groups: groupFailures(reasons), total: reasons.length, truncated: true };
}
