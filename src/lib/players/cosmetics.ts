import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { CosmeticKind, CosmeticRow } from "@/lib/supabase/types";
import { purchaseRef } from "./ember-rules";
import { spendEmbers } from "./embers";

/**
 * The wardrobe: what Embers buy, who owns what, and buying it.
 *
 * The one rule that shapes this whole file: a free cosmetic has no
 * ownership row. `cost_embers = 0` means everybody owns it, forever,
 * including the player who signs up tonight. The first cut seeded a row
 * per free item per player and a probe caught what that misses — a
 * migration runs once, so anyone created afterwards started with an
 * empty wardrobe and nothing to equip.
 */

export interface CosmeticItem {
  slug: string;
  kind: CosmeticKind;
  name: string;
  description: string;
  cost: number;
  /** Lifetime Embers needed before it can be bought at all, or null. */
  requiresEarned: number | null;
  owned: boolean;
  equipped: boolean;
  /** False when it is neither owned nor reachable yet. */
  affordable: boolean;
  /** Set when the item is gated and the player is not there yet. */
  lockedUntil: number | null;
}

export interface Wardrobe {
  frames: CosmeticItem[];
  holos: CosmeticItem[];
  effects: CosmeticItem[];
}

/** What is equipped right now. Null in a slot means the free default. */
export interface Equipped {
  frame: string | null;
  holo: string | null;
  effect: string | null;
}

/** The whole catalogue, ordered the way it should be shown. */
export async function listCosmetics(): Promise<CosmeticRow[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("cosmetics")
    .select("*")
    .order("kind")
    .order("sort_order");

  if (error) {
    console.error("Could not read the cosmetics catalogue", error);
    return [];
  }

  return data ?? [];
}

/** The slugs a player has actually bought. Free items are not in here. */
export async function purchasedSlugs(playerId: string): Promise<Set<string>> {
  if (!isSupabaseConfigured()) return new Set();

  const { data, error } = await getSupabaseAdmin()
    .from("player_cosmetics")
    .select("cosmetic_slug")
    .eq("player_id", playerId);

  if (error) {
    console.error("Could not read a player's cosmetics", error);
    return new Set();
  }

  return new Set((data ?? []).map((row) => row.cosmetic_slug));
}

/**
 * Does this player own this slug?
 *
 * The single place the free-is-implicit rule is decided, so equipping,
 * buying and rendering can never disagree about it.
 */
export function ownsCosmetic(
  item: Pick<CosmeticRow, "slug" | "cost_embers">,
  purchased: Set<string>,
): boolean {
  return item.cost_embers === 0 || purchased.has(item.slug);
}

/**
 * The shop and the wardrobe are the same screen, so this is one call.
 *
 * Everything is returned, owned or not: a locked item that shows what it
 * costs is the thing that makes the currency mean anything. Hiding it
 * until it is affordable would leave a new player looking at three free
 * items and no reason to trade.
 */
export async function wardrobeFor(
  playerId: string,
  standing: { earned: number; balance: number },
  equipped: Equipped,
): Promise<Wardrobe> {
  const [catalogue, purchased] = await Promise.all([
    listCosmetics(),
    purchasedSlugs(playerId),
  ]);

  const equippedFor = (kind: CosmeticKind): string | null =>
    kind === "frame"
      ? equipped.frame
      : kind === "holo"
        ? equipped.holo
        : equipped.effect;

  const items = catalogue.map((row): CosmeticItem => {
    const owned = ownsCosmetic(row, purchased);
    const gated = row.requires_earned !== null && standing.earned < row.requires_earned;

    return {
      slug: row.slug,
      kind: row.kind,
      name: row.name,
      description: row.description,
      cost: row.cost_embers,
      requiresEarned: row.requires_earned,
      owned,
      /*
       * A null slot equips the free item of that kind, so the free item
       * has to read as equipped or the shop shows nothing selected on a
       * brand new profile.
       */
      equipped:
        equippedFor(row.kind) === row.slug ||
        (equippedFor(row.kind) === null && row.cost_embers === 0),
      affordable: owned || (!gated && standing.balance >= row.cost_embers),
      lockedUntil: gated ? row.requires_earned : null,
    };
  });

  return {
    frames: items.filter((item) => item.kind === "frame"),
    holos: items.filter((item) => item.kind === "holo"),
    effects: items.filter((item) => item.kind === "effect"),
  };
}

export type BuyOutcome =
  | { ok: true; slug: string }
  | {
      ok: false;
      reason: "unknown" | "owned" | "locked" | "too-expensive" | "unavailable";
    };

/**
 * Buys a cosmetic and equips it in one go.
 *
 * Equipping immediately because there is no version of "I bought the
 * Prism Holo and would now like to not wear it" worth a second tap.
 *
 * The order matters and is deliberate: take the Embers first, then
 * record ownership. If the ownership write fails the player is out the
 * Embers and can retry — and the retry is free, because `spend_embers`
 * refuses a ref it has seen, returns false, and this function falls
 * through to grant the row it failed to grant last time. The other order
 * would hand out the goods and then fail to charge.
 */
export async function buyCosmetic(playerId: string, slug: string): Promise<BuyOutcome> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const admin = getSupabaseAdmin();

  const { data: item, error } = await admin
    .from("cosmetics")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("Could not read the cosmetic being bought", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!item) return { ok: false, reason: "unknown" };

  const purchased = await purchasedSlugs(playerId);
  if (ownsCosmetic(item, purchased)) {
    // Already theirs. Treat the tap as "equip it", which is what it means.
    const equipped = await equipCosmetic(playerId, item.kind, slug);
    return equipped ? { ok: true, slug } : { ok: false, reason: "unavailable" };
  }

  const { data: player, error: playerError } = await admin
    .from("players")
    .select("embers_earned")
    .eq("id", playerId)
    .maybeSingle();

  if (playerError || !player) {
    if (playerError) console.error("Could not read the buyer", playerError);
    return { ok: false, reason: "unavailable" };
  }

  if (item.requires_earned !== null && player.embers_earned < item.requires_earned) {
    return { ok: false, reason: "locked" };
  }

  /*
   * The gate that actually matters is inside spend_embers, not here.
   * This is a public POST endpoint's worth of distance from the
   * database, and the balance can change between the two.
   */
  const paid = await spendEmbers(
    playerId,
    item.cost_embers,
    purchaseRef(playerId, slug),
    item.name,
  );

  if (!paid) {
    /*
     * Either not enough Embers, or a retry of a purchase that already
     * charged. The second case still needs its ownership row, so check
     * the ledger rather than assuming the worse of the two.
     */
    const { data: charged } = await admin
      .from("ember_ledger")
      .select("ref")
      .eq("ref", purchaseRef(playerId, slug))
      .maybeSingle();

    if (!charged) return { ok: false, reason: "too-expensive" };
  }

  const { error: grantError } = await admin
    .from("player_cosmetics")
    .upsert(
      { player_id: playerId, cosmetic_slug: slug },
      { onConflict: "player_id,cosmetic_slug", ignoreDuplicates: true },
    );

  if (grantError) {
    console.error("Could not grant the cosmetic", grantError);
    return { ok: false, reason: "unavailable" };
  }

  const equipped = await equipCosmetic(playerId, item.kind, slug);
  return equipped ? { ok: true, slug } : { ok: false, reason: "unavailable" };
}

/**
 * The players column each kind of cosmetic is worn in.
 *
 * Written out as three literal objects rather than one computed key,
 * because a computed key widens the update to a string index signature
 * and supabase-js then cannot tell it from an arbitrary column write.
 */
function slotUpdate(kind: CosmeticKind, slug: string | null) {
  if (kind === "frame") return { equipped_frame: slug };
  if (kind === "holo") return { equipped_holo: slug };
  return { equipped_effect: slug };
}

/**
 * Wears a cosmetic the player already owns.
 *
 * Ownership is re-checked here rather than trusted from the caller: this
 * is reachable from a Server Action, and "equip" with an arbitrary slug
 * would otherwise be a way to wear the Galaxy Holo without buying it.
 */
export async function equipCosmetic(
  playerId: string,
  kind: CosmeticKind,
  slug: string | null,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const admin = getSupabaseAdmin();

  if (slug !== null) {
    const { data: item } = await admin
      .from("cosmetics")
      .select("slug, kind, cost_embers")
      .eq("slug", slug)
      .maybeSingle();

    if (!item || item.kind !== kind) return false;
    if (!ownsCosmetic(item, await purchasedSlugs(playerId))) return false;
  }

  const { error } = await admin
    .from("players")
    .update(slotUpdate(kind, slug))
    .eq("id", playerId);

  if (error) {
    console.error("Could not equip the cosmetic", error);
    return false;
  }

  return true;
}

/**
 * The free item of one kind, which is what a null slot means.
 *
 * Read from the catalogue rather than hard-coded, so renaming or
 * replacing a free item is a data change and not a code change.
 */
export async function freeSlugFor(kind: CosmeticKind): Promise<string | null> {
  const catalogue = await listCosmetics();
  return (
    catalogue.find((row) => row.kind === kind && row.cost_embers === 0)?.slug ?? null
  );
}

/**
 * What a profile is actually wearing, resolved for rendering.
 *
 * Null becomes the free item of that kind rather than nothing, so a
 * renderer never has to know the free-is-implicit rule — it gets a slug
 * either way.
 */
export async function resolveEquipped(equipped: Equipped): Promise<Equipped> {
  const catalogue = await listCosmetics();

  const freeOf = (kind: CosmeticKind): string | null =>
    catalogue.find((row) => row.kind === kind && row.cost_embers === 0)?.slug ?? null;

  return {
    frame: equipped.frame ?? freeOf("frame"),
    holo: equipped.holo ?? freeOf("holo"),
    effect: equipped.effect ?? freeOf("effect"),
  };
}
