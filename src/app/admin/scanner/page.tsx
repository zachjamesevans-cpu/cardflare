import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ScannerBenchLabel } from "@/components/admin/scanner-bench-label";
import { ScannerBenchUpload } from "@/components/admin/scanner-bench-upload";
import { ScannerSettingsForm } from "@/components/admin/scanner-settings-form";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { slotName } from "@/lib/cards/page-geometry";
import { listBenchmarks, scannerNumbers } from "@/lib/cards/scan-bench";
import { BENCH_MODES, scoreRun, type BenchRun } from "@/lib/cards/scan-bench-rules";
import { providerKeys, scannerSettings } from "@/lib/cards/scan-settings";

export const metadata: Metadata = {
  title: "Scanner",
  robots: { index: false, follow: false },
};

/** Privileged and per-request, like the rest of the console. */
export const dynamic = "force-dynamic";
/* A bench run reads one photo three times over. */
export const maxDuration = 300;

/**
 * The binder-page scanner, for admins: its settings, the bench, and the
 * numbers. The founder (2026-10-13): "Do not claim accuracy improvements
 * without measuring them against labeled test data." So every share on
 * this page is over labelled pockets only, and says how many there were.
 */

const MODE_NAMES = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  hybrid: "Hybrid",
} as const;

const percent = (value: number | null) =>
  value === null ? "-" : `${Math.round(value * 100)}%`;
const cents = (value: number | null) => (value === null ? "-" : `${value.toFixed(2)}¢`);
const seconds = (ms: number | null) =>
  ms === null ? "-" : `${(ms / 1000).toFixed(1)}s`;

const STATUS_TONE = {
  matched: "text-success",
  ambiguous: "text-warning",
  unrecognized: "text-danger",
  empty: "text-text-muted",
} as const;

function RunColumn({ run }: { run: BenchRun | undefined }) {
  if (!run) return <p className="text-sm text-text-muted">Not run.</p>;
  if (!run.ok) {
    return (
      <p className="text-sm text-danger">
        {run.reason === "no-key"
          ? "No key for this provider."
          : `Failed: ${run.reason}`}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-text-muted tabular-nums">
        {seconds(run.ms)} · {cents(run.cents)} · {run.input.toLocaleString()} in /{" "}
        {run.output.toLocaleString()} out · {run.calls}{" "}
        {run.calls === 1 ? "call" : "calls"}
        {run.escalated > 0 ? ` · ${run.escalated} sent to OpenAI` : ""}
      </p>
      <ol className="flex flex-col gap-0.5 text-sm">
        {run.pockets.map((pocket) => (
          <li key={pocket.slot} className="flex gap-2">
            <span className="w-6 shrink-0 text-text-muted">
              {slotName(pocket.slot)}
            </span>
            <span className={`w-20 shrink-0 ${STATUS_TONE[pocket.status]}`}>
              {pocket.status}
            </span>
            <span className="truncate text-text-secondary">
              {pocket.status === "empty"
                ? ""
                : `${pocket.name} ${pocket.number}`.trim()}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default async function ScannerAdminPage() {
  // The layout guards too. Duplicated deliberately: a layout is not a
  // security boundary on its own.
  await requireAdmin();

  const [settings, benches, numbers] = await Promise.all([
    scannerSettings(),
    listBenchmarks(),
    scannerNumbers(),
  ]);
  const keys = providerKeys();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link
          href="/admin"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to admin
        </Link>
        <h2 className="text-xl font-bold text-text-primary">Scanner</h2>
        <p className="max-w-2xl text-sm text-text-secondary">
          Which AI reads binder pages, how sure a card must be to go in without a check,
          and what a page may spend. The bench runs one photo through all three modes on
          the same cut-out pockets; label the right answers and the accuracy numbers
          below come from those labels alone. Bench runs cost real API credit and never
          touch a binder.
        </p>
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="settings-heading">
        <h3 id="settings-heading" className="text-lg font-semibold text-text-primary">
          Settings
        </h3>
        <Card>
          <ScannerSettingsForm settings={settings} keys={keys} />
        </Card>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="numbers-heading">
        <h3 id="numbers-heading" className="text-lg font-semibold text-text-primary">
          Numbers
        </h3>
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm tabular-nums">
            <caption className="mb-2 text-left text-sm text-text-secondary">
              The bench, by mode. Accuracy is over labelled photos only.
            </caption>
            <thead className="text-text-muted">
              <tr>
                <th className="py-1 pr-4 font-medium">Mode</th>
                <th className="py-1 pr-4 font-medium">Photos</th>
                <th className="py-1 pr-4 font-medium">Labelled</th>
                <th className="py-1 pr-4 font-medium">Exact card</th>
                <th className="py-1 pr-4 font-medium">Exact printing</th>
                <th className="py-1 pr-4 font-medium">Right pocket</th>
                <th className="py-1 pr-4 font-medium">Empty pockets</th>
                <th className="py-1 pr-4 font-medium">Cost a page</th>
                <th className="py-1 pr-4 font-medium">Time a page</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              {numbers.bench.map((row) => (
                <tr key={row.mode}>
                  <td className="py-1 pr-4 text-text-primary">
                    {MODE_NAMES[row.mode]}
                  </td>
                  <td className="py-1 pr-4">{row.photos}</td>
                  <td className="py-1 pr-4">{row.labelled}</td>
                  <td className="py-1 pr-4">{percent(row.exactCard)}</td>
                  <td className="py-1 pr-4">{percent(row.exactPrinting)}</td>
                  <td className="py-1 pr-4">{percent(row.placement)}</td>
                  <td className="py-1 pr-4">{percent(row.emptyDetection)}</td>
                  <td className="py-1 pr-4">{cents(row.averageCents)}</td>
                  <td className="py-1 pr-4">{seconds(row.averageMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm tabular-nums">
            <caption className="mb-2 text-left text-sm text-text-secondary">
              Players&apos; pages, the last 30 days. Corrections are pockets changed
              before placing, counted once a page is placed.
            </caption>
            <thead className="text-text-muted">
              <tr>
                <th className="py-1 pr-4 font-medium">Mode</th>
                <th className="py-1 pr-4 font-medium">Pages</th>
                <th className="py-1 pr-4 font-medium">Matched</th>
                <th className="py-1 pr-4 font-medium">To check</th>
                <th className="py-1 pr-4 font-medium">Can&apos;t identify</th>
                <th className="py-1 pr-4 font-medium">Corrected</th>
                <th className="py-1 pr-4 font-medium">Cost a page</th>
                <th className="py-1 pr-4 font-medium">Time a page</th>
              </tr>
            </thead>
            <tbody className="text-text-secondary">
              {numbers.live.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-2 text-text-muted">
                    No pages scanned yet.
                  </td>
                </tr>
              ) : (
                numbers.live.map((row) => (
                  <tr key={row.mode}>
                    <td className="py-1 pr-4 text-text-primary">
                      {MODE_NAMES[row.mode as keyof typeof MODE_NAMES] ?? row.mode}
                    </td>
                    <td className="py-1 pr-4">{row.pages}</td>
                    <td className="py-1 pr-4">{percent(row.matched)}</td>
                    <td className="py-1 pr-4">{percent(row.review)}</td>
                    <td className="py-1 pr-4">{percent(row.unrecognized)}</td>
                    <td className="py-1 pr-4">{percent(row.correctionRate)}</td>
                    <td className="py-1 pr-4">{cents(row.averageCents)}</td>
                    <td className="py-1 pr-4">{seconds(row.averageMs)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="bench-heading">
        <h3 id="bench-heading" className="text-lg font-semibold text-text-primary">
          Bench
        </h3>
        <Card>
          <ScannerBenchUpload />
        </Card>
        {benches.map((bench) => (
          <Card key={bench.id} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="font-semibold text-text-primary">
                {bench.label || "Unlabelled photo"}
              </h4>
              <span className="text-xs text-text-muted">
                {new Date(bench.createdAt).toISOString().slice(0, 16).replace("T", " ")}{" "}
                UTC
                {bench.detect &&
                  ` · pockets found by ${bench.detect.method}, ${percent(bench.detect.confidence)} sure${
                    bench.detect.needsAlignment ? ", would ask to line up" : ""
                  }${bench.detect.blurry ? ", blurry" : ""}`}
              </span>
            </div>
            <div className="grid gap-4 lg:grid-cols-[12rem_1fr]">
              <div className="grid grid-cols-3 gap-1">
                {bench.pockets.map((src, slot) =>
                  src ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      key={slot}
                      src={src}
                      alt={`Pocket ${slotName(slot)}`}
                      className="aspect-[63/88] w-full rounded-sm object-cover"
                    />
                  ) : (
                    <span
                      key={slot}
                      className="aspect-[63/88] rounded-sm bg-elevated"
                    />
                  ),
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {BENCH_MODES.map((mode) => {
                  const run = bench.runs[mode];
                  const score =
                    run?.ok && bench.truth ? scoreRun(run, bench.truth) : null;
                  return (
                    <div key={mode} className="flex flex-col gap-2">
                      <p className="text-sm font-semibold text-text-primary">
                        {MODE_NAMES[mode]}
                        {score && score.cards > 0 && (
                          <span className="ml-2 font-normal text-text-muted tabular-nums">
                            {score.exact} of {score.cards} exact
                          </span>
                        )}
                      </p>
                      <RunColumn run={run} />
                    </div>
                  );
                })}
              </div>
            </div>
            <ScannerBenchLabel id={bench.id} runs={bench.runs} truth={bench.truth} />
          </Card>
        ))}
      </section>
    </div>
  );
}
