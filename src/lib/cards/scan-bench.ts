import "server-only";

import { readCrops, recordRun, type ReadOutcome } from "@/lib/cards/page-reader";
import { readPagePhoto } from "@/lib/cards/page-vision";
import { photoType } from "@/lib/cards/scan";
import {
  BENCH_MODES,
  benchTotals,
  liveTotals,
  type BenchMode,
  type BenchPocket,
  type BenchRun,
  type BenchTruth,
  type LiveTotals,
  type ModeTotals,
} from "@/lib/cards/scan-bench-rules";
import { compactCode, POCKETS_PER_PAGE, SCAN_MAX_BYTES } from "@/lib/cards/scan-rules";
import { providerKeys, scannerSettings } from "@/lib/cards/scan-settings";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * The scanner bench, for admins: one photo through all three modes side by
 * side, the admin's own labels on it, and the numbers that come of that.
 *
 * The founder (2026-10-13): "upload a binder photo ... run all three modes
 * side by side ... manually label correct answers ... calculate exact card
 * accuracy, exact printing accuracy, placement accuracy, empty slot
 * detection accuracy, correction rate, average cost per page and average
 * processing time per page", and "Keep benchmark scans separate from
 * production user scans." So a bench photo never touches a binder or a
 * queue, every mode pays for its own reads (the read cache is not used),
 * and its runs are logged as kind "benchmark".
 */

const BUCKET = "scans";
const BENCH_MAX_BYTES = SCAN_MAX_BYTES * 4;

export interface BenchView {
  id: string;
  createdAt: string;
  label: string;
  /** Short-lived links: the photo and its nine cut pockets. */
  photo: string | null;
  pockets: (string | null)[];
  detect: {
    method: string;
    confidence: number;
    needsAlignment: boolean;
    blurry: boolean;
  } | null;
  runs: Partial<Record<BenchMode, BenchRun>>;
  truth: BenchTruth[] | null;
}

type Stored = {
  detect?: BenchView["detect"];
  modes?: Partial<Record<BenchMode, BenchRun>>;
};

function summarise(
  mode: BenchMode,
  outcome: ReadOutcome | { ok: false; reason: string; run: null },
): BenchRun {
  const run = outcome.run;
  const pockets: BenchPocket[] = outcome.ok
    ? outcome.pockets.map((pocket) => {
        const top =
          pocket.state === "found"
            ? pocket.matches[0]
            : pocket.state === "unread"
              ? (pocket.suggestions?.[0] ?? null)
              : null;
        const read = pocket.state === "empty" ? null : pocket.read;
        return {
          slot: pocket.slot,
          status:
            pocket.status ?? (pocket.state === "empty" ? "empty" : "unrecognized"),
          /* A weak guess is not an answer: only found pockets name a card. */
          cardId: pocket.state === "found" ? (top?.card.id ?? null) : null,
          printingId: pocket.state === "found" ? (top?.printingId ?? null) : null,
          name: top?.card.exactName ?? read?.englishName ?? read?.name ?? "",
          number: top?.card.canonicalCardNumber ?? read?.number ?? "",
        };
      })
    : [];
  return {
    mode,
    ok: outcome.ok,
    reason: outcome.ok ? null : outcome.reason,
    ms: run?.ms ?? 0,
    cents: run?.cents ?? 0,
    input: run?.calls.reduce((t, c) => t + c.input, 0) ?? 0,
    output: run?.calls.reduce((t, c) => t + c.output, 0) ?? 0,
    calls: run?.calls.length ?? 0,
    escalated: run?.escalated.length ?? 0,
    pockets,
  };
}

/**
 * One photo through all three modes. The page is found once and the same
 * nine cut pockets go to every mode, so the modes are compared on exactly
 * the same pictures. A mode whose provider has no key is recorded as such,
 * never quietly run on the other provider.
 */
export async function runBenchmark(
  userId: string,
  bytes: Uint8Array,
  label: string,
): Promise<
  | { ok: true; id: string }
  | { ok: false; reason: "unavailable" | "too-big" | "not-a-photo" }
> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  if (bytes.length === 0 || bytes.length > BENCH_MAX_BYTES)
    return { ok: false, reason: "too-big" };
  const type = photoType(bytes);
  if (!type) return { ok: false, reason: "not-a-photo" };
  const admin = getSupabaseAdmin();

  const { data: row, error } = await admin
    .from("scan_benchmarks")
    .insert({ created_by: userId, label: label.trim().slice(0, 120) })
    .select("id")
    .single();
  if (error || !row) {
    console.error("Could not start a scanner benchmark", error?.code);
    return { ok: false, reason: "unavailable" };
  }

  const vision = await readPagePhoto(bytes);
  await Promise.all([
    admin.storage
      .from(BUCKET)
      .upload(`bench/${row.id}/page`, bytes, { contentType: type, upsert: true }),
    ...vision.pockets.map((pocket) =>
      admin.storage
        .from(BUCKET)
        .upload(`bench/${row.id}/pocket-${pocket.slot}.jpg`, pocket.jpeg, {
          contentType: "image/jpeg",
          upsert: true,
        }),
    ),
  ]);

  const settings = await scannerSettings();
  const keys = providerKeys();
  const crops = vision.pockets.map((pocket) => ({
    slot: pocket.slot,
    bytes: pocket.jpeg,
    mediaType: "image/jpeg" as const,
    looksEmpty: pocket.looksEmpty,
    cardSeen: pocket.cardSeen,
    glare: pocket.glare,
  }));
  const runs = await Promise.all(
    BENCH_MODES.map(async (mode): Promise<BenchRun> => {
      const needs = mode === "openai" ? keys.openai : keys.anthropic;
      if (!needs) return summarise(mode, { ok: false, reason: "no-key", run: null });
      const outcome = await readCrops(crops, {
        games: [],
        settings,
        mode,
        cache: false,
      });
      await recordRun(outcome.run, {
        playerId: null,
        kind: "benchmark",
        detectMethod: vision.method,
      });
      return summarise(mode, outcome);
    }),
  );

  const stored: Stored = {
    detect: {
      method: vision.method,
      confidence: vision.confidence,
      needsAlignment: vision.needsAlignment,
      blurry: vision.blurry,
    },
    modes: Object.fromEntries(runs.map((run) => [run.mode, run])),
  };
  await admin.from("scan_benchmarks").update({ runs: stored }).eq("id", row.id);
  return { ok: true, id: row.id };
}

const isTruth = (value: unknown): value is BenchTruth[] =>
  Array.isArray(value) &&
  value.every(
    (t) =>
      t &&
      typeof t === "object" &&
      Number.isInteger((t as BenchTruth).slot) &&
      typeof (t as BenchTruth).empty === "boolean",
  );

/** The admin's right answer for a bench photo: nine pockets, each empty or a card. */
export async function labelBenchmark(
  id: string,
  truth: BenchTruth[],
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const clean = truth
    .filter((t) => Number.isInteger(t.slot) && t.slot >= 0 && t.slot < POCKETS_PER_PAGE)
    .map((t) => ({
      slot: t.slot,
      empty: Boolean(t.empty),
      cardId: t.empty ? null : t.cardId || null,
      printingId: t.empty ? null : t.printingId || null,
    }));
  const { error } = await getSupabaseAdmin()
    .from("scan_benchmarks")
    .update({ truth: clean })
    .eq("id", id);
  return !error;
}

/** A bench photo gone, its pictures with it. */
export async function deleteBenchmark(id: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const admin = getSupabaseAdmin();
  await admin.storage
    .from(BUCKET)
    .remove([
      `bench/${id}/page`,
      ...Array.from(
        { length: POCKETS_PER_PAGE },
        (_, s) => `bench/${id}/pocket-${s}.jpg`,
      ),
    ])
    .catch(() => {});
  const { error } = await admin.from("scan_benchmarks").delete().eq("id", id);
  return !error;
}

/** Every bench photo, newest first, with links to its pictures. */
export async function listBenchmarks(limit = 30): Promise<BenchView[]> {
  if (!isSupabaseConfigured()) return [];
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("scan_benchmarks")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  const rows = data ?? [];
  const paths = rows.flatMap((row) => [
    `bench/${row.id}/page`,
    ...Array.from(
      { length: POCKETS_PER_PAGE },
      (_, s) => `bench/${row.id}/pocket-${s}.jpg`,
    ),
  ]);
  const { data: signed } =
    paths.length > 0
      ? await admin.storage.from(BUCKET).createSignedUrls(paths, 60 * 60)
      : { data: [] };
  const urlOf = new Map(
    (signed ?? []).flatMap((s) =>
      s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [],
    ),
  );
  return rows.map((row) => {
    const stored = (row.runs ?? {}) as Stored;
    return {
      id: row.id,
      createdAt: row.created_at,
      label: row.label,
      photo: urlOf.get(`bench/${row.id}/page`) ?? null,
      pockets: Array.from(
        { length: POCKETS_PER_PAGE },
        (_, s) => urlOf.get(`bench/${row.id}/pocket-${s}.jpg`) ?? null,
      ),
      detect: stored.detect ?? null,
      runs: stored.modes ?? {},
      truth: isTruth(row.truth) ? row.truth : null,
    };
  });
}

/** The numbers: the bench by mode, and the live scanner by mode over the last 30 days. */
export async function scannerNumbers(): Promise<{
  bench: ModeTotals[];
  live: LiveTotals[];
}> {
  if (!isSupabaseConfigured()) return { bench: benchTotals([]), live: [] };
  const admin = getSupabaseAdmin();
  const [benches, runs] = await Promise.all([
    admin.from("scan_benchmarks").select("runs, truth").limit(500),
    admin
      .from("scan_runs")
      .select("mode, cents, ms, matched, review, unrecognized, corrections")
      .eq("kind", "page")
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .limit(5000),
  ]);
  const bench = benchTotals(
    (benches.data ?? []).map((row) => ({
      runs: ((row.runs ?? {}) as Stored).modes ?? {},
      truth: isTruth(row.truth) ? row.truth : null,
    })),
  );
  const live = liveTotals(
    (runs.data ?? []).map((row) => ({ ...row, cents: Number(row.cents) })),
  );
  return { bench, live };
}

/** A card by its printed number, in any game: its id when exactly one card has it. */
export async function cardByNumber(number: string): Promise<string | null> {
  const compact = compactCode(number);
  if (!compact || !isSupabaseConfigured()) return null;
  const { data } = await getSupabaseAdmin()
    .from("cards")
    .select("id")
    .eq("compact_card_number", compact)
    .limit(2);
  return data && data.length === 1 ? data[0].id : null;
}

/** Pages the live scanner read in the last 30 days, for the console's tile. */
export async function pagesScannedLately(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const { count } = await getSupabaseAdmin()
    .from("scan_runs")
    .select("id", { count: "exact", head: true })
    .eq("kind", "page")
    .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
  return count ?? 0;
}
