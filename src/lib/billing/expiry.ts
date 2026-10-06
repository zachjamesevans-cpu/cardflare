import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  syncPlayerTierFromSubscription,
  syncStoreTierFromSubscription,
} from "./repository";

/**
 * The daily lowering of tiers whose paid period has run out.
 *
 * Every gate reads `players.tier` (and `stores.tier`), and those
 * columns are only written when something HAPPENS: a webhook, a
 * restore, a checkout. A cancellation takes effect at the end of the
 * period already paid for, and nothing happens at that moment - Stripe
 * has already sent its last event and Apple may never send one - so a
 * canceled Pro stayed Pro for good. This walks every subscription whose
 * period end is behind us and asks the same sync the webhooks use; the
 * sync's own rules decide (an active renewal stays, an admin-granted
 * tier is never touched), so a rerun or an overlap with a webhook is a
 * no-op.
 */

/** Rows per run. A day's lapses are far fewer; the cap bounds a bad day. */
const BATCH = 500;
/** Syncs in flight at once, so a long list does not open 500 queries. */
const CONCURRENCY = 8;

export async function syncLapsedSubscriptions(
  now: Date = new Date(),
): Promise<{ players: number; stores: number; failed: boolean }> {
  if (!isSupabaseConfigured()) return { players: 0, stores: 0, failed: true };

  const { data, error } = await getSupabaseAdmin()
    .from("subscriptions")
    .select("player_id, store_id")
    .lt("current_period_end", now.toISOString())
    .order("current_period_end", { ascending: false })
    .limit(BATCH);

  if (error) {
    console.error("Could not list lapsed subscriptions", error);
    return { players: 0, stores: 0, failed: true };
  }

  const players = [
    ...new Set((data ?? []).map((row) => row.player_id).filter(Boolean)),
  ] as string[];
  const stores = [
    ...new Set((data ?? []).map((row) => row.store_id).filter(Boolean)),
  ] as string[];

  const jobs: Array<() => Promise<void>> = [
    ...players.map((id) => () => syncPlayerTierFromSubscription(id)),
    ...stores.map((id) => () => syncStoreTierFromSubscription(id)),
  ];

  for (let start = 0; start < jobs.length; start += CONCURRENCY) {
    await Promise.all(
      jobs.slice(start, start + CONCURRENCY).map((job) =>
        job().catch((cause) => console.error("Could not sync a lapsed tier", cause)),
      ),
    );
  }

  return { players: players.length, stores: stores.length, failed: false };
}
