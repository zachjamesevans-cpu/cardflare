import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  compactCardNumber,
  normalizeName,
  type CardDataProvider,
  type NormalizationFailure,
  type NormalizedCard,
} from "./domain";

export interface SyncOptions {
  mode: "sample" | "full";
  onProgress?: (message: string) => void;
}

export interface SyncSummary {
  runId: string | null;
  provider: string;
  mode: "sample" | "full";
  recordsSeen: number;
  cardsUpserted: number;
  printingsUpserted: number;
  recordsFailed: number;
  imagesSkipped: number;
  uniqueCards: number;
}

/** Supabase rejects very large payloads, so writes go up in batches. */
const BATCH = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Collapses provider records that share a card number.
 *
 * The provider returns one record per printing, but a card number is one
 * gameplay identity. Merging is deliberately non-destructive: the first record
 * establishes the card, later ones only fill fields the first left null and
 * contribute their own printing. A later record never overwrites a value that
 * is already present, because there is no basis for preferring it.
 */
export function mergeByCardNumber(cards: NormalizedCard[]): NormalizedCard[] {
  const merged = new Map<string, NormalizedCard>();

  for (const card of cards) {
    const existing = merged.get(card.canonicalCardNumber);

    if (!existing) {
      merged.set(card.canonicalCardNumber, { ...card, printings: [...card.printings] });
      continue;
    }

    for (const key of [
      "cardType",
      "cost",
      "power",
      "counter",
      "life",
      "rarity",
      "effectText",
      "triggerText",
    ] as const) {
      if (existing[key] === null && card[key] !== null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (existing as any)[key] = card[key];
      }
    }

    if (existing.colors.length === 0) existing.colors = card.colors;
    if (existing.traits.length === 0) existing.traits = card.traits;

    /*
     * The card takes the shortest of the names its printings carry.
     *
     * Found by the spot check: EB01-001 was displaying as "Kouzuki Oden (SPR)"
     * — a variant's name standing in for the card's — purely because that
     * record happened to merge first. Whichever record arrives first is not a
     * basis for naming a card.
     *
     * The provider marks a variant by appending to the base name and never by
     * removing from it: "Kouzuki Oden (SPR)", "Gum-Gum Lightning (Premium Card
     * Collection -Best Selection Vol. 4-)". So the shortest is the base. This
     * is a rule for choosing between names the provider gave us, not for
     * writing one — every name is still stored verbatim on its own printing.
     */
    if (card.exactName.length < existing.exactName.length) {
      existing.exactName = card.exactName;
    }

    // Printings are keyed by provider id, so re-seeing one is not a duplicate.
    for (const printing of card.printings) {
      const seen = existing.printings.some(
        (p) => p.providerExternalId === printing.providerExternalId,
      );
      if (!seen) existing.printings.push(printing);
    }
  }

  return [...merged.values()];
}

/**
 * Pulls a provider's catalog into Supabase.
 *
 * Idempotent. Cards upsert on `(game, canonical_card_number)` and printings on
 * `(provider_key, provider_external_id)`, so running twice updates rather than
 * duplicates.
 *
 * Nothing is ever deleted. A provider that temporarily omits a card — a bad
 * deploy on their side, a partial response — must not silently empty the
 * catalog mid-event. Removing a card is a deliberate act, not a side effect of
 * a sync.
 */
export async function syncCards(
  provider: CardDataProvider,
  options: SyncOptions,
): Promise<SyncSummary> {
  const admin = getSupabaseAdmin();
  const progress = options.onProgress ?? (() => {});

  const summary: SyncSummary = {
    runId: null,
    provider: provider.providerKey,
    mode: options.mode,
    recordsSeen: 0,
    cardsUpserted: 0,
    printingsUpserted: 0,
    recordsFailed: 0,
    imagesSkipped: 0,
    uniqueCards: 0,
  };

  const { data: run } = await admin
    .from("card_sync_runs")
    .insert({ provider_key: provider.providerKey, mode: options.mode })
    .select("id")
    .single();

  summary.runId = run?.id ?? null;

  try {
    const { cards, failures } = await provider.fetchCards({
      sample: options.mode === "sample",
      onProgress: progress,
    });

    summary.recordsSeen = cards.length + failures.length;
    summary.recordsFailed = failures.length;

    const unique = mergeByCardNumber(cards);
    summary.uniqueCards = unique.length;
    progress(`${cards.length} record(s) collapsed to ${unique.length} unique card(s)`);

    await recordFailures(summary.runId, failures);

    for (const batch of chunk(unique, BATCH)) {
      const { data: rows, error } = await admin
        .from("cards")
        .upsert(
          batch.map((card) => toCardRow(card, provider)),
          {
            onConflict: "game,canonical_card_number",
          },
        )
        .select("id, canonical_card_number");

      if (error || !rows) {
        throw new Error(`Could not upsert cards: ${error?.message}`, { cause: error });
      }

      summary.cardsUpserted += rows.length;

      const idByNumber = new Map(
        rows.map((row) => [row.canonical_card_number, row.id]),
      );
      summary.printingsUpserted += await upsertPrintings(
        batch,
        idByNumber,
        provider,
        summary,
      );

      progress(`  upserted ${summary.cardsUpserted}/${unique.length} cards`);
    }

    await finishRun(summary, "succeeded", null);
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishRun(summary, "failed", message.slice(0, 500));
    throw error;
  }
}

function toCardRow(card: NormalizedCard, provider: CardDataProvider) {
  return {
    canonical_card_number: card.canonicalCardNumber,
    compact_card_number: compactCardNumber(card.canonicalCardNumber),
    exact_name: card.exactName,
    normalized_name: normalizeName(card.exactName),
    card_type: card.cardType,
    colors: card.colors,
    traits: card.traits,
    cost: card.cost,
    power: card.power,
    counter: card.counter,
    life: card.life,
    rarity: card.rarity,
    attribute: card.attribute,
    effect_text: card.effectText,
    trigger_text: card.triggerText,
    provider_key: provider.providerKey,
    provider_external_id: card.providerExternalId,
    raw_metadata: card.rawMetadata ?? null,
    provider_updated_at: card.providerUpdatedAt,
    updated_at: new Date().toISOString(),
  };
}

async function upsertPrintings(
  batch: NormalizedCard[],
  idByNumber: Map<string, string>,
  provider: CardDataProvider,
  summary: SyncSummary,
): Promise<number> {
  const rows = batch.flatMap((card) => {
    const cardId = idByNumber.get(card.canonicalCardNumber);
    if (!cardId) return [];

    return card.printings.map((printing) => {
      // The single place artwork is gated at the data layer. A provider that
      // has not declared the capability cannot populate it by accident.
      const image = provider.suppliesImages ? printing.imageUrl : null;
      if (printing.imageUrl && !image) summary.imagesSkipped += 1;

      return {
        card_id: cardId,
        provider_key: provider.providerKey,
        provider_external_id: printing.providerExternalId,
        set_code: printing.setCode,
        set_name: printing.setName,
        printing_label: printing.printingLabel,
        variant_type: printing.variantType,
        rarity: printing.rarity,
        printing_name: printing.name,
        image_id: printing.imageId,
        provider_source: printing.source,
        is_alternate_art: printing.isAlternateArt,
        is_promo: printing.isPromo,
        is_parallel: printing.isParallel,
        is_reprint: printing.isReprint,
        language: printing.language,
        image_url: image,
        raw_metadata: printing.rawMetadata ?? null,
        provider_updated_at: printing.providerUpdatedAt,
        updated_at: new Date().toISOString(),
      };
    });
  });

  if (rows.length === 0) return 0;

  const { error } = await getSupabaseAdmin()
    .from("card_printings")
    .upsert(rows, { onConflict: "provider_key,provider_external_id" });

  if (error) {
    throw new Error(`Could not upsert printings: ${error.message}`, { cause: error });
  }

  return rows.length;
}

/** Persists rejected records so a provider change is a query, not a hunt. */
async function recordFailures(
  runId: string | null,
  failures: NormalizationFailure[],
): Promise<void> {
  if (!runId || failures.length === 0) return;

  for (const batch of chunk(failures, BATCH)) {
    const { error } = await getSupabaseAdmin()
      .from("card_sync_failures")
      .insert(
        batch.map((failure) => ({
          run_id: runId,
          provider_external_id: failure.providerExternalId,
          reason: failure.reason.slice(0, 1000),
          raw_record: (failure.raw ?? null) as never,
        })),
      );

    if (error) console.error("Could not record sync failures", error);
  }
}

async function finishRun(
  summary: SyncSummary,
  status: "succeeded" | "failed",
  notes: string | null,
): Promise<void> {
  if (!summary.runId) return;

  const { error } = await getSupabaseAdmin()
    .from("card_sync_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      records_seen: summary.recordsSeen,
      cards_upserted: summary.cardsUpserted,
      printings_upserted: summary.printingsUpserted,
      records_failed: summary.recordsFailed,
      notes,
    })
    .eq("id", summary.runId);

  if (error) console.error("Could not finalise the sync run", error);
}

/**
 * How long a run may sit in `running` before it is treated as abandoned.
 *
 * `finishRun` writes the terminal status, so a process that is killed —
 * a serverless invocation hitting its time limit, a laptop closing mid-command —
 * leaves the row `running` forever. Without a ceiling that one row would block
 * every future run. Generously longer than any run should take.
 */
export const STALE_RUN_MS = 20 * 60 * 1000;

/**
 * The run currently in progress, if there genuinely is one.
 *
 * Two syncs at once would double the load on a free provider and race each
 * other's upserts, so callers use this to refuse rather than queue. A run past
 * `STALE_RUN_MS` is marked failed here rather than reported as live: leaving it
 * would both block new runs and make the admin panel claim a sync is happening
 * when nothing is running.
 */
export async function activeSyncRun(
  now: number = Date.now(),
): Promise<{ id: string; mode: string; startedAt: string } | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("card_sync_runs")
    .select("id, mode, started_at")
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Could not check for a running sync", error);
    // Fail closed: an unreadable table is not evidence that nothing is running.
    throw new Error("Could not check whether a sync is already running");
  }

  if (!data) return null;

  if (now - new Date(data.started_at).getTime() > STALE_RUN_MS) {
    await getSupabaseAdmin()
      .from("card_sync_runs")
      .update({
        status: "failed",
        finished_at: new Date(now).toISOString(),
        notes: "Abandoned — the process stopped before the run finished.",
      })
      .eq("id", data.id)
      .eq("status", "running");

    return null;
  }

  return { id: data.id, mode: data.mode, startedAt: data.started_at };
}

/** The most recent finished run, for the admin panel. */
export async function latestSyncRun() {
  const { data, error } = await getSupabaseAdmin()
    .from("card_sync_runs")
    .select(
      "id, mode, status, started_at, finished_at, cards_upserted, printings_upserted, records_seen, records_failed, notes",
    )
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Could not read the last sync run", error);
    return null;
  }

  return data;
}
