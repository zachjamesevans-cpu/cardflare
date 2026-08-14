import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { grantSpendableEmbers, spendEmbers } from "@/lib/players/embers";
import {
  DUPLICATE_EMBERS,
  drawPack,
  type PoolEntry,
  type SeriesManifest,
} from "./index";
import { seriesOrNull } from "./index";

/**
 * Sealed packs: granting, buying, opening.
 *
 * Contents are drawn AT OPENING with crypto randomness - a sealed row
 * stores nothing about what is inside, so there is nothing to peek at
 * and re-rolling by clever refreshing is impossible: the guarded
 * update below claims the row exactly once, and the draw happens after
 * the claim.
 */

export interface SealedPack {
  id: string;
  series: string;
  source: string;
}

export interface PackPull {
  slug: string;
  rarity: string;
  /** Already owned: the pull became Embers instead. */
  duplicate: boolean;
  embersInstead: number;
}

export async function grantPack(
  playerId: string,
  series: string,
  source: "signup" | "purchase",
): Promise<boolean> {
  if (!isSupabaseConfigured() || !seriesOrNull(series)) return false;

  const { error } = await getSupabaseAdmin()
    .from("player_packs")
    .insert({ player_id: playerId, series, source });

  if (error) {
    console.error("Could not grant a pack", error);
    return false;
  }
  return true;
}

/** The signup pack, exactly once: skipped if one was ever granted. */
export async function grantSignupPackOnce(playerId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("player_packs")
    .select("id")
    .eq("player_id", playerId)
    .eq("source", "signup")
    .limit(1)
    .maybeSingle();

  if (!data) await grantPack(playerId, "origin", "signup");
}

export async function listSealedPacks(playerId: string): Promise<SealedPack[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("player_packs")
    .select("id, series, source")
    .eq("player_id", playerId)
    .is("opened_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Could not list packs", error);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    series: row.series,
    source: row.source,
  }));
}

export async function buyPackWithEmbers(
  playerId: string,
  seriesId: string,
): Promise<"bought" | "cannot-afford" | "failed"> {
  const series = seriesOrNull(seriesId);
  if (!series || !isSupabaseConfigured()) return "failed";

  /* A UNIQUE ref per purchase: the ledger's ref index treats a repeat
     as already-paid, which is right for one-off cosmetics and dead
     wrong for consumables - the founder's second pack was refused as
     "not enough Embers" by exactly this. */
  const paid = await spendEmbers(
    playerId,
    series.priceEmbers,
    `pack:${series.id}:${crypto.randomUUID()}`,
    `${series.name} pack`,
  );
  if (!paid) return "cannot-afford";

  const granted = await grantPack(playerId, series.id, "purchase");
  if (!granted) {
    /* The pack failed to mint after payment: give the Embers back. */
    await grantSpendableEmbers(
      playerId,
      series.priceEmbers,
      `pack-refund:${series.id}`,
    );
    return "failed";
  }
  return "bought";
}

/**
 * Open a sealed pack. Claim first (the guarded update), draw after,
 * grant each pull; a pull the player already owns becomes Embers.
 */
export async function openPack(
  playerId: string,
  packId: string,
): Promise<{ series: SeriesManifest; pulls: PackPull[] } | null> {
  if (!isSupabaseConfigured()) return null;

  const admin = getSupabaseAdmin();

  const { data: claimed, error: claimError } = await admin
    .from("player_packs")
    .update({ opened_at: new Date().toISOString() })
    .eq("id", packId)
    .eq("player_id", playerId)
    .is("opened_at", null)
    .select("series")
    .maybeSingle();

  if (claimError || !claimed) {
    if (claimError) console.error("Could not claim the pack", claimError);
    return null;
  }

  const series = seriesOrNull(claimed.series);
  if (!series) return null;

  /* Plenty of rolls: slots plus re-draw headroom for duplicates. */
  const rolls = Array.from({ length: series.slots * 6 }, () => {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] / 0xffffffff;
  });
  const drawn: PoolEntry[] = drawPack(series, rolls);

  const { data: ownedRows } = await admin
    .from("player_cosmetics")
    .select("cosmetic_slug")
    .eq("player_id", playerId);
  const owned = new Set((ownedRows ?? []).map((row) => row.cosmetic_slug));

  const pulls: PackPull[] = [];
  for (const entry of drawn) {
    if (owned.has(entry.slug)) {
      await grantSpendableEmbers(
        playerId,
        DUPLICATE_EMBERS,
        `pack-duplicate:${packId}:${entry.slug}`,
      );
      pulls.push({
        slug: entry.slug,
        rarity: entry.rarity,
        duplicate: true,
        embersInstead: DUPLICATE_EMBERS,
      });
    } else {
      const { error } = await admin
        .from("player_cosmetics")
        .insert({ player_id: playerId, cosmetic_slug: entry.slug });
      if (error) console.error("Could not grant a pull", error);
      pulls.push({
        slug: entry.slug,
        rarity: entry.rarity,
        duplicate: false,
        embersInstead: 0,
      });
    }
  }

  return { series, pulls };
}
