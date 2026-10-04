import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { wrongCards } from "@/lib/cards/spot-check-verdicts";
import { openReportCount } from "@/lib/players/safety";

/**
 * What went wrong lately, in one place.
 *
 * The audit found the Riftbound import's refusal (a 403 from a bot
 * filter) buried at the bottom of a long page, and a sync three weeks
 * old presented as a fact rather than a problem. This gathers every
 * failed or stale job the database knows about, so the dashboard can
 * lead with it.
 *
 * Honest about its reach: catalogue syncs and imports are recorded as
 * runs, so they are here; a spot check marked wrong is here; email and
 * push delivery are NOT logged anywhere, so a bounced email is not,
 * and the box says so rather than implying silence means success.
 */

export interface Failure {
  kind: "sync-failed" | "sync-stale" | "card-wrong" | "report-open";
  /** "Riftbound", "One Piece", or the card. */
  subject: string;
  /** What happened, in a sentence. */
  detail: string;
  when: string;
  href: string;
}

const STALE_DAYS = 14;
const RECENT_DAYS = 30;

const PROVIDER_NAMES: Record<string, string> = {
  optcgapi: "One Piece (OPTCG API)",
  scryfall: "Magic (Scryfall)",
  tcgdex: "Pokémon (TCGdex)",
  fabcube: "Flesh and Blood (FaB Cube)",
  riftcodex: "Riftbound (Riftcodex)",
  lorcast: "Lorcana (Lorcast)",
};

function providerName(key: string): string {
  return PROVIDER_NAMES[key] ?? key;
}

export async function recentFailures(now = Date.now()): Promise<{
  failures: Failure[];
  /** What this list cannot see, said plainly. */
  blindSpots: string[];
}> {
  const blindSpots = [
    "Email and push delivery are not logged, so a bounced notice does not show here.",
  ];
  if (!isSupabaseConfigured()) return { failures: [], blindSpots };

  const admin = getSupabaseAdmin();
  const since = new Date(now - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: runs } = await admin
    .from("card_sync_runs")
    .select(
      "id, provider_key, mode, status, started_at, finished_at, records_failed, notes",
    )
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(200);

  const failures: Failure[] = [];

  /* The latest run per provider decides: a failure that a later run
     fixed is history, not a problem. */
  const latestByProvider = new Map<string, NonNullable<typeof runs>[number]>();
  for (const run of runs ?? []) {
    if (run.status === "running") continue;
    if (!latestByProvider.has(run.provider_key))
      latestByProvider.set(run.provider_key, run);
  }

  for (const run of latestByProvider.values()) {
    if (run.status === "failed") {
      failures.push({
        kind: "sync-failed",
        subject: providerName(run.provider_key),
        detail: run.notes ?? "The run failed without saying why.",
        when: run.finished_at ?? run.started_at,
        href: "/admin#sync-heading",
      });
    } else if (run.records_failed > 0) {
      failures.push({
        kind: "sync-failed",
        subject: providerName(run.provider_key),
        detail: `${run.records_failed.toLocaleString()} ${run.records_failed === 1 ? "record was" : "records were"} refused in the last run.`,
        when: run.finished_at ?? run.started_at,
        href: "/admin#sync-heading",
      });
    }
  }

  /* Stale: the newest successful run of any provider is older than two
     weeks. Only providers that have ever run are judged. */
  const { data: lastGood } = await admin
    .from("card_sync_runs")
    .select("provider_key, finished_at")
    .eq("status", "succeeded")
    .order("finished_at", { ascending: false })
    .limit(200);
  const newestGood = new Map<string, string>();
  for (const run of lastGood ?? []) {
    if (run.finished_at && !newestGood.has(run.provider_key)) {
      newestGood.set(run.provider_key, run.finished_at);
    }
  }
  for (const [key, finishedAt] of newestGood) {
    const ageDays = (now - new Date(finishedAt).getTime()) / (24 * 60 * 60 * 1000);
    if (
      ageDays > STALE_DAYS &&
      !failures.some((f) => f.subject === providerName(key))
    ) {
      failures.push({
        kind: "sync-stale",
        subject: providerName(key),
        detail: `Last synced ${Math.floor(ageDays)} days ago.`,
        when: finishedAt,
        href: "/admin#sync-heading",
      });
    }
  }

  const openReports = await openReportCount();
  if (openReports > 0) {
    failures.push({
      kind: "report-open",
      subject: "Reports from players",
      detail: `${openReports} waiting for a look.`,
      when: "",
      href: "/admin/reports#queue",
    });
  }

  for (const card of await wrongCards()) {
    failures.push({
      kind: "card-wrong",
      subject: `${card.cardName} (${card.cardNumber})`,
      detail: card.note ?? "Marked wrong in the spot check.",
      when: "",
      href: "/admin/spot-check",
    });
  }

  return { failures, blindSpots };
}
