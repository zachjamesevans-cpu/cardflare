import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { packArtSrc } from "@/lib/admin/pack-sets";

import { SERIES } from "./index";
import type { PoolEntry, Rarity, SeriesManifest } from "./manifest";

/**
 * Every pack that can be bought and opened: the sets written in code
 * (Origin) and every set built in the admin console that is ready.
 *
 * The console has always saved sets to `pack_series`, but buying and
 * opening only knew the code's SERIES map, so a set made there showed in
 * the Feed and could not be bought or opened. Ready means: status live,
 * on sale (no release date, or one that has passed), weights that add
 * up to 100, and every item in it live - a draft item would be a pull
 * nobody can see.
 */
export interface ShopSeries extends SeriesManifest {
  /** The cosmetics' display names, by slug, for the opening and the odds. */
  names: Record<string, string>;
  /** The pack's own art, or null for the default wrapper. */
  artUrl: string | null;
  description: string;
}

const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

function fromCode(series: SeriesManifest): ShopSeries {
  return { ...series, names: {}, artUrl: null, description: "" };
}

/**
 * `forSale` false is for OPENING a pack somebody already holds: the set
 * may since have been taken off sale or rescheduled, and a pack that was
 * paid for still opens. Its items still have to be live and add up.
 */
async function fromDatabase(onlyId?: string, forSale = true): Promise<ShopSeries[]> {
  if (!isSupabaseConfigured()) return [];
  const admin = getSupabaseAdmin();

  let query = admin.from("pack_series").select("*");
  if (forSale) query = query.eq("status", "live");
  if (onlyId) query = query.eq("slug", onlyId);
  const { data: rows, error } = await query;
  if (error || !rows?.length) return [];

  const slugs = rows.map((row) => row.slug);
  const [{ data: items }, { data: cosmetics }] = await Promise.all([
    admin.from("pack_series_items").select("*").in("series_slug", slugs),
    admin.from("cosmetics").select("slug, name, status"),
  ]);
  const bySlug = new Map((cosmetics ?? []).map((row) => [row.slug, row]));
  const now = Date.now();

  return rows.flatMap((row) => {
    if (row.slug in SERIES) return [];
    if (forSale && row.release_at && new Date(row.release_at).getTime() > now)
      return [];

    const mine = (items ?? []).filter((item) => item.series_slug === row.slug);
    if (mine.length < row.slots) return [];
    if (mine.some((item) => bySlug.get(item.cosmetic_slug)?.status !== "live"))
      return [];
    const total = mine.reduce((sum, item) => sum + Number(item.weight), 0);
    if (Math.abs(total - 100) > 0.01) return [];

    const pool: PoolEntry[] = mine
      .map((item) => ({
        slug: item.cosmetic_slug,
        rarity: (RARITIES.includes(item.rarity as Rarity)
          ? item.rarity
          : "common") as Rarity,
        weight: Number(item.weight),
      }))
      .sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity));

    return [
      {
        id: row.slug,
        name: row.name,
        setNumber: row.set_number,
        priceEmbers: row.price_embers,
        slots: row.slots,
        pool,
        names: Object.fromEntries(
          mine.map((item) => [
            item.cosmetic_slug,
            bySlug.get(item.cosmetic_slug)?.name ?? item.cosmetic_slug,
          ]),
        ),
        artUrl: packArtSrc(row.art_path),
        description: row.description,
      },
    ];
  });
}

/** Every pack on sale, newest set first. */
export async function shopSeries(): Promise<ShopSeries[]> {
  const fromSets = await fromDatabase();
  return [...fromSets, ...Object.values(SERIES).map(fromCode)].sort(
    (a, b) => b.setNumber - a.setNumber,
  );
}

/**
 * One pack by id: code first, then a console set; null if neither.
 * `opening` finds a set that is no longer on sale, for a pack already
 * held; buying never does.
 */
export async function seriesById(
  id: string,
  { opening = false }: { opening?: boolean } = {},
): Promise<ShopSeries | null> {
  const coded = SERIES[id];
  if (coded) return fromCode(coded);
  const [found] = await fromDatabase(id, !opening);
  return found ?? null;
}
