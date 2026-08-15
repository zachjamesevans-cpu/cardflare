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
  /** Frames, marked equipped against the PROFILE PICTURE slot. */
  avatarFrames: CosmeticItem[];
  /** The same frames, marked equipped against the card DEFAULT slot. */
  cardFrames: CosmeticItem[];
  holos: CosmeticItem[];
  effects: CosmeticItem[];
}

/**
 * What is equipped right now. Null in a slot means the free default.
 *
 * Four slots since the founder split borders: `avatarFrame` dresses the
 * profile picture, `frame` and `holo` are the DEFAULTS showcase cards
 * inherit (a card can override both for itself), and `effect` is worn
 * by every card.
 */
export interface Equipped {
  avatarFrame: string | null;
  frame: string | null;
  holo: string | null;
  effect: string | null;
}

/**
 * Where a cosmetic is worn. Two slots take frames, so the kind alone
 * cannot say which column an equip writes — the shop section does.
 */
export type EquipSlot = "avatarFrame" | "cardFrame" | "holo" | "effect";

/** The catalogue kind a slot accepts. */
export function kindForSlot(slot: EquipSlot): CosmeticKind {
  if (slot === "avatarFrame" || slot === "cardFrame") return "frame";
  return slot;
}

/**
 * The catalogue, ordered the way it should be shown.
 *
 * LIVE ONLY by default, and every player-facing path goes through here:
 * the store, the wardrobe, the room popup, the app. A draft cosmetic
 * exists for the admin console and nowhere else, so the filter belongs
 * at the read rather than at each of the dozen screens downstream.
 *
 * `includeDraft` is for the console alone, and every caller passing it
 * has already checked for admin.
 */
export async function listCosmetics({
  includeDraft = false,
}: { includeDraft?: boolean } = {}): Promise<CosmeticRow[]> {
  if (!isSupabaseConfigured()) return [];

  let query = getSupabaseAdmin().from("cosmetics").select("*");
  if (!includeDraft) query = query.eq("status", "live");

  const { data, error } = await query.order("kind").order("sort_order");

  if (error) {
    console.error("Could not read the cosmetics catalogue", error);
    return [];
  }

  return data ?? [];
}

/**
 * What a player owns, in the two ways owning happens.
 *
 * `purchased` is what they bought. `unlockedAll` is the admin grant, and
 * it is a flag rather than a set on purpose: it has to cover cosmetics
 * that do not exist yet. Carried together so no caller can check one and
 * forget the other.
 */
export interface OwnedCosmetics {
  purchased: Set<string>;
  /** The admin grant over every LIVE cosmetic. */
  unlockedAll: boolean;
  /** The admin grant that also covers the draft catalog. Founder only. */
  unlockedDraft: boolean;
}

export async function ownedCosmetics(playerId: string): Promise<OwnedCosmetics> {
  const empty: OwnedCosmetics = {
    purchased: new Set(),
    unlockedAll: false,
    unlockedDraft: false,
  };
  if (!isSupabaseConfigured()) return empty;

  const admin = getSupabaseAdmin();

  const [rows, player] = await Promise.all([
    admin.from("player_cosmetics").select("cosmetic_slug").eq("player_id", playerId),
    admin
      .from("players")
      .select("cosmetics_unlocked, cosmetics_unlocked_draft")
      .eq("id", playerId)
      .maybeSingle(),
  ]);

  if (rows.error) {
    console.error("Could not read a player's cosmetics", rows.error);
    return empty;
  }
  if (player.error) {
    console.error("Could not read the unlock-all grant", player.error);
  }

  return {
    purchased: new Set((rows.data ?? []).map((row) => row.cosmetic_slug)),
    unlockedAll: player.data?.cosmetics_unlocked ?? false,
    unlockedDraft: player.data?.cosmetics_unlocked_draft ?? false,
  };
}

/**
 * Does this player own this slug?
 *
 * The single place all three ways of owning something are decided —
 * free, bought, or granted forever — so equipping, buying and rendering
 * can never disagree about it.
 */
export function ownsCosmetic(
  item: Pick<CosmeticRow, "slug" | "cost_embers" | "status">,
  owned: OwnedCosmetics,
): boolean {
  /* A draft is not for sale and not covered by the ordinary unlock-all
     grant, however generous it is. Exactly one thing reaches it: the
     admin grant that says so by name. Checked FIRST so no later clause
     can hand a behind-the-scenes cosmetic to somebody by accident -
     cost_embers is 0 on every draft row, and that alone would otherwise
     read as "free". */
  if (item.status === "draft") return owned.unlockedDraft;

  return owned.unlockedAll || item.cost_embers === 0 || owned.purchased.has(item.slug);
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
  const [catalogue, owned] = await Promise.all([
    listCosmetics(),
    ownedCosmetics(playerId),
  ]);

  const itemsFor = (kind: CosmeticKind, worn: string | null): CosmeticItem[] =>
    catalogue
      .filter((row) => row.kind === kind)
      .map((row): CosmeticItem => {
        const has = ownsCosmetic(row, owned);
        /*
         * An unlock-all grant clears the lifetime gate too. "Always
         * unlocked, forever" means exactly that; making somebody who was
         * handed everything still grind to 500 for Orbit would be a
         * strange kind of gift.
         */
        const gated =
          !owned.unlockedAll &&
          row.requires_earned !== null &&
          standing.earned < row.requires_earned;

        return {
          slug: row.slug,
          kind: row.kind,
          name: row.name,
          description: row.description,
          cost: row.cost_embers,
          requiresEarned: row.requires_earned,
          owned: has,
          /*
           * A null slot equips the free item of that kind, so the free
           * item has to read as equipped or the shop shows nothing
           * selected on a brand new profile.
           */
          equipped: worn === row.slug || (worn === null && row.cost_embers === 0),
          affordable: has || (!gated && standing.balance >= row.cost_embers),
          lockedUntil: gated ? row.requires_earned : null,
        };
      });

  /*
   * Frames are listed twice — once per slot they can be worn in. Same
   * items, same ownership, different "Equipped" mark, which is exactly
   * what the two shop sections need. One purchase covers both.
   */
  return {
    avatarFrames: itemsFor("frame", equipped.avatarFrame),
    cardFrames: itemsFor("frame", equipped.frame),
    holos: itemsFor("holo", equipped.holo),
    effects: itemsFor("effect", equipped.effect),
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
export async function buyCosmetic(
  playerId: string,
  slug: string,
  /**
   * Which slot the tap came from. A frame bought in the Profile borders
   * section goes straight onto the picture; the same frame bought under
   * Card borders becomes the card default. Defaults to the kind's own
   * slot so callers that predate the split (the app) keep working.
   */
  slot?: EquipSlot,
): Promise<BuyOutcome> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const admin = getSupabaseAdmin();

  /* Draft cosmetics are not for sale at any price - filtered here as
     well as in the listing, because a slug typed into a POST never went
     through the listing. */
  const { data: item, error } = await admin
    .from("cosmetics")
    .select("*")
    .eq("slug", slug)
    .eq("status", "live")
    .maybeSingle();

  if (error) {
    console.error("Could not read the cosmetic being bought", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!item) return { ok: false, reason: "unknown" };

  /* Only the shipped kinds sell individually here. The catalogue kinds
     arrive through packs and equip through player_equips instead. */
  const target: EquipSlot | null =
    slot ??
    (item.kind === "frame"
      ? "cardFrame"
      : item.kind === "holo" || item.kind === "effect"
        ? item.kind
        : null);
  if (!target || kindForSlot(target) !== item.kind) {
    return { ok: false, reason: "unknown" };
  }

  const owned = await ownedCosmetics(playerId);
  if (ownsCosmetic(item, owned)) {
    // Already theirs. Treat the tap as "equip it", which is what it means.
    const equipped = await equipCosmetic(playerId, target, slug);
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

  const equipped = await equipCosmetic(playerId, target, slug);
  return equipped ? { ok: true, slug } : { ok: false, reason: "unavailable" };
}

/**
 * The players column each slot writes.
 *
 * Written out as literal objects rather than one computed key, because a
 * computed key widens the update to a string index signature and
 * supabase-js then cannot tell it from an arbitrary column write.
 */
function slotUpdate(slot: EquipSlot, slug: string | null) {
  if (slot === "avatarFrame") return { equipped_avatar_frame: slug };
  if (slot === "cardFrame") return { equipped_frame: slug };
  if (slot === "holo") return { equipped_holo: slug };
  return { equipped_effect: slug };
}

/**
 * Wears a cosmetic the player already owns, in one slot.
 *
 * Ownership is re-checked here rather than trusted from the caller: this
 * is reachable from a Server Action, and "equip" with an arbitrary slug
 * would otherwise be a way to wear the Galaxy Holo without buying it.
 */
export async function equipCosmetic(
  playerId: string,
  slot: EquipSlot,
  slug: string | null,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const admin = getSupabaseAdmin();

  if (slug !== null) {
    const { data: item } = await admin
      .from("cosmetics")
      .select("slug, kind, cost_embers, status")
      .eq("slug", slug)
      .maybeSingle();

    if (!item || item.kind !== kindForSlot(slot)) return false;
    if (!ownsCosmetic(item, await ownedCosmetics(playerId))) return false;
  }

  const { error } = await admin
    .from("players")
    .update(slotUpdate(slot, slug))
    .eq("id", playerId);

  if (error) {
    console.error("Could not equip the cosmetic", error);
    return false;
  }

  /*
   * The circle around the picture has ONE owner: putting an original
   * avatar frame on takes the catalogue ring off, exactly as wearing a
   * ring takes the frame off (see setEquip). Failure here is logged and
   * swallowed - on a database that has not run the player_equips
   * migration yet there is no ring to take off.
   */
  if (slot === "avatarFrame" && slug !== null) {
    const { error: ringError } = await admin
      .from("player_equips")
      .delete()
      .eq("player_id", playerId)
      .eq("kind", "ring");
    if (ringError) console.error("Could not take off the worn ring", ringError);
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
    avatarFrame: equipped.avatarFrame ?? freeOf("frame"),
    frame: equipped.frame ?? freeOf("frame"),
    holo: equipped.holo ?? freeOf("holo"),
    effect: equipped.effect ?? freeOf("effect"),
  };
}
