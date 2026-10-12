import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

import { tierMayWear } from "./cosmetics";
import {
  DAILY_OFFERS,
  dayKey,
  resetsAt,
  rotate,
  type DailyShelf,
} from "./daily-shop-rules";
import { purchaseRef } from "./ember-rules";
import { spendEmbers } from "./embers";
import { EQUIP_KINDS, setEquip, type EquipKind } from "./equips";

/**
 * The daily shop, the database side. The pool is every live, priced
 * cosmetic of the catalogue kinds (rings, auras, card borders and the
 * rest) - the frames, holos and effects have shelves of their own - and
 * daily-shop-rules.ts picks today's few from it.
 *
 * Buying follows buyCosmetic's rules: Pro, asked before an Ember moves;
 * the Embers first, then ownership, with a retry free by ref; then it is
 * worn. And only what is on today's shelf can be bought here.
 */

export type { DailyOffer, DailyShelf } from "./daily-shop-rules";

async function pool() {
  const { data, error } = await getSupabaseAdmin()
    .from("cosmetics")
    .select("slug, kind, name, description, cost_embers, requires_earned")
    .eq("status", "live")
    .gt("cost_embers", 0)
    .in("kind", [...EQUIP_KINDS]);
  if (error) {
    console.error("Could not read the daily shop's pool", error);
    return [];
  }
  return data ?? [];
}

/** Today's shelf, with what the player already owns marked. */
export async function dailyShelf(
  playerId: string,
  now = new Date(),
): Promise<DailyShelf> {
  const empty = { offers: [], resetsAt: resetsAt(now) };
  if (!isSupabaseConfigured()) return empty;

  const items = await pool();
  const today = rotate(
    items.map((item) => item.slug),
    dayKey(now),
    DAILY_OFFERS,
  );
  const { data: owned } = await getSupabaseAdmin()
    .from("player_cosmetics")
    .select("cosmetic_slug")
    .eq("player_id", playerId)
    .in("cosmetic_slug", today.length > 0 ? today : ["-"]);
  const mine = new Set((owned ?? []).map((row) => row.cosmetic_slug));
  const bySlug = new Map(items.map((item) => [item.slug, item]));

  return {
    offers: today.flatMap((slug) => {
      const item = bySlug.get(slug);
      if (!item) return [];
      return [
        {
          slug,
          kind: item.kind,
          name: item.name,
          description: item.description,
          costEmbers: item.cost_embers,
          owned: mine.has(slug),
          requiresEarned: item.requires_earned,
        },
      ];
    }),
    resetsAt: resetsAt(now),
  };
}

export type DailyBuyOutcome =
  "bought" | "owned" | "not-today" | "not-pro" | "locked" | "too-expensive" | "failed";

export async function buyDailyOffer(
  playerId: string,
  slug: string,
  now = new Date(),
): Promise<DailyBuyOutcome> {
  if (!isSupabaseConfigured()) return "failed";

  const shelf = await dailyShelf(playerId, now);
  const offer = shelf.offers.find((entry) => entry.slug === slug);
  if (!offer) return "not-today";

  /* Buying ends in wearing, and wearing is Pro: asked before any Embers
     move, the same rule as buyCosmetic and the packs. */
  if (!(await tierMayWear(playerId))) return "not-pro";

  if (offer.owned) {
    await setEquip(playerId, offer.kind as EquipKind, slug);
    return "owned";
  }

  const admin = getSupabaseAdmin();
  if (offer.requiresEarned !== null) {
    const { data: player } = await admin
      .from("players")
      .select("embers_earned")
      .eq("id", playerId)
      .maybeSingle();
    if (!player || player.embers_earned < offer.requiresEarned) return "locked";
  }

  /* Embers first, then ownership; a retry of a purchase that already
     charged finds its ledger row and grants what it paid for. */
  const paid = await spendEmbers(
    playerId,
    offer.costEmbers,
    purchaseRef(playerId, slug),
    offer.name,
  );
  if (!paid) {
    const { data: charged } = await admin
      .from("ember_ledger")
      .select("ref")
      .eq("ref", purchaseRef(playerId, slug))
      .maybeSingle();
    if (!charged) return "too-expensive";
  }

  const { error } = await admin
    .from("player_cosmetics")
    .upsert(
      { player_id: playerId, cosmetic_slug: slug },
      { onConflict: "player_id,cosmetic_slug", ignoreDuplicates: true },
    );
  if (error) {
    console.error("Could not grant a daily shop cosmetic", error);
    return "failed";
  }

  await setEquip(playerId, offer.kind as EquipKind, slug);
  return "bought";
}
