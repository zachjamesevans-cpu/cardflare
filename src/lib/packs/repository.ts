import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { tierMayWear } from "@/lib/players/cosmetics";
import { grantSpendableEmbers, spendEmbers } from "@/lib/players/embers";
import {
  DUPLICATE_EMBERS,
  drawPackWithPity,
  isTopPull,
  type PoolEntry,
  type SeriesManifest,
} from "./index";
import { seriesById } from "./catalog";

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
  if (!isSupabaseConfigured() || !(await seriesById(series))) return false;

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
): Promise<"bought" | "cannot-afford" | "not-pro" | "failed"> {
  const series = await seriesById(seriesId);
  if (!series || !isSupabaseConfigured()) return "failed";

  /*
   * Packs are Pro, like buying a cosmetic (buyCosmetic). The Embers
   * review found a free player could spend 300 Embers on cosmetics they
   * could not wear; the founder chose to keep wearing Pro and stop the
   * spend instead ("option b"). Refused before a single Ember moves. The
   * signup pack is a gift and still arrives for everyone.
   */
  if (!(await tierMayWear(playerId))) return "not-pro";

  /* A UNIQUE ref per purchase: the ledger's ref index treats a repeat
     as already-paid, which is right for one-off cosmetics and dead
     wrong for consumables - the founder's second pack was refused as
     "not enough Embers" by exactly this. */
  const purchase = crypto.randomUUID();
  const paid = await spendEmbers(
    playerId,
    series.priceEmbers,
    `pack:${series.id}:${purchase}`,
    `${series.name} pack`,
  );
  if (!paid) return "cannot-afford";

  const granted = await grantPack(playerId, series.id, "purchase");
  if (!granted) {
    /* The pack failed to mint after payment: give the Embers back.
       The refund ref names THIS purchase, for the same reason the
       spend does: `ember_ledger.ref` is unique across every player,
       so a bare `pack-refund:<series>` would refund the first failed
       purchase anyone ever made and silently keep everyone else's. */
    const refunded = await grantSpendableEmbers(
      playerId,
      series.priceEmbers,
      `pack-refund:${series.id}:${playerId}:${purchase}`,
      `${series.name} pack refund`,
    );
    if (!refunded) {
      console.error("A pack purchase failed AND its refund failed", {
        playerId,
        series: series.id,
        purchase,
      });
    }
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

  /* Which set it is BEFORE it is claimed: a pack whose set cannot be
     drawn stays sealed rather than being opened into nothing. A set
     taken off sale since still opens for a pack already held. */
  const { data: sealed } = await admin
    .from("player_packs")
    .select("series")
    .eq("id", packId)
    .eq("player_id", playerId)
    .is("opened_at", null)
    .maybeSingle();
  if (!sealed) return null;
  const series = await seriesById(sealed.series, { opening: true });
  if (!series) return null;

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

  /* Plenty of rolls: slots plus re-draw headroom for duplicates. */
  const rolls = Array.from({ length: series.slots * 6 }, () => {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] / 0xffffffff;
  });
  /* The pity rule (manifest.ts): packs of this set opened in a row
     without an Epic or better. Missing table or row reads as none. */
  const { data: pity } = await admin
    .from("player_pack_pity")
    .select("packs_without_top")
    .eq("player_id", playerId)
    .eq("series", series.id)
    .maybeSingle();
  const drawn: PoolEntry[] = drawPackWithPity(
    series,
    rolls,
    pity?.packs_without_top ?? 0,
  );

  /* Reset by a top pull, otherwise one more in the run. */
  const { error: pityError } = await admin.from("player_pack_pity").upsert(
    {
      player_id: playerId,
      series: series.id,
      packs_without_top: drawn.some(isTopPull) ? 0 : (pity?.packs_without_top ?? 0) + 1,
    },
    { onConflict: "player_id,series" },
  );
  if (pityError) console.error("Could not count the pity run", pityError);

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
      if (!error) {
        owned.add(entry.slug);
        pulls.push({
          slug: entry.slug,
          rarity: entry.rarity,
          duplicate: false,
          embersInstead: 0,
        });
        continue;
      }
      /*
       * The pack is already claimed, so a pull that did not land can't
       * be drawn again. Never show it as won when the row is not there:
       * the player would go looking in Customize for something they do
       * not own. It becomes Embers instead, exactly as a duplicate
       * does - and if even that fails, it is reported as nothing, not
       * as a prize.
       */
      console.error("Could not grant a pull", error);
      const compensated = await grantSpendableEmbers(
        playerId,
        DUPLICATE_EMBERS,
        `pack-duplicate:${packId}:${entry.slug}`,
      );
      pulls.push({
        slug: entry.slug,
        rarity: entry.rarity,
        duplicate: true,
        embersInstead: compensated ? DUPLICATE_EMBERS : 0,
      });
    }
  }

  return { series, pulls };
}
