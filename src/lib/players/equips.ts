import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { ownedCosmetics, ownsCosmetic } from "@/lib/players/cosmetics";
import { tierAllows } from "@/lib/tiers";
import { artFilesFor, artFileOf, type CosmeticArtFile } from "@/lib/players/art-files";
import type { CosmeticRow } from "@/lib/supabase/types";

/**
 * Wearing the catalogue: one slot per category.
 *
 * The founder's rule, verbatim: "non-live cosmetics that I've unlocked
 * on the admin side should only be visible in my profile customization,
 * NOT in embers store." So the wardrobe here shows live items to
 * everyone who can own them, plus draft items ONLY to a player carrying
 * the everything-grant - and the store never learns drafts exist,
 * because it reads listCosmetics(), which is live-only.
 */

export const EQUIP_KINDS = [
  "ring",
  "aura",
  "border",
  "pattern",
  "animation",
  "background",
  "scene",
  "nameplate",
  "title",
  "badge",
] as const;

export type EquipKind = (typeof EQUIP_KINDS)[number];

export function isEquipKind(value: string): value is EquipKind {
  return (EQUIP_KINDS as readonly string[]).includes(value);
}

/**
 * The customize menu, split in two so neither wand opens a wall: the
 * founder's call. Profile is everything worn on YOU; showcase is
 * everything worn on your cards and the shelf they sit on. The unit
 * test holds the two halves to exactly EQUIP_KINDS, no gaps, no overlap.
 */
export const EQUIP_AREAS = {
  profile: ["ring", "aura", "nameplate", "title", "badge", "scene"],
  showcase: ["border", "pattern", "animation", "background"],
} as const satisfies Record<string, readonly EquipKind[]>;

export type EquipArea = keyof typeof EQUIP_AREAS;

export function equipArea(value: string | undefined): EquipArea {
  return value === "showcase" ? "showcase" : "profile";
}

/** What a picture wears: the border band and the floating animation. */
export interface AvatarWear {
  ring: string | null;
  aura: string | null;
  /** Set when the worn piece is a dropped-in Rive file, not CSS art. */
  ringArt: CosmeticArtFile | null;
  auraArt: CosmeticArtFile | null;
}

/**
 * The worn ring and aura for a batch of players, for rooms and
 * rosters: one query for the whole room, same economics as
 * roomIdentitiesFor.
 */
export async function avatarWearFor(
  playerIds: string[],
): Promise<Map<string, AvatarWear>> {
  const wear = new Map<string, AvatarWear>();
  const ids = [...new Set(playerIds)];
  if (!isSupabaseConfigured() || ids.length === 0) return wear;

  const [{ data, error }, { data: tiers }] = await Promise.all([
    getSupabaseAdmin()
      .from("player_equips")
      .select("player_id, kind, cosmetic_slug")
      .in("kind", ["ring", "aura"])
      .in("player_id", ids),
    getSupabaseAdmin().from("players").select("id, tier").in("id", ids),
  ]);

  if (error) {
    console.error("Could not read worn rings and auras", error);
    return wear;
  }

  /*
   * A lapsed Pro's look comes OFF at the read, not just at the equip:
   * the equips row survives (their look is waiting for them, which is
   * the honest upsell), but nothing renders for a tier that no longer
   * wears cosmetics. Same shape as avatarPathFor's animated fallback.
   */
  const wears = new Set(
    (tiers ?? [])
      .filter((row) => tierAllows(row.tier, "cosmetics"))
      .map((row) => row.id),
  );

  const rows = (data ?? []).filter((row) => wears.has(row.player_id));

  /* One lookup for every Rive file worn in the room, not one per
     player: a table of twelve wearing the same ring costs one read. */
  const rive = await artFilesFor(rows.map((row) => row.cosmetic_slug));

  for (const row of rows) {
    const entry = wear.get(row.player_id) ?? {
      ring: null,
      aura: null,
      ringArt: null,
      auraArt: null,
    };
    if (row.kind === "ring") {
      entry.ring = row.cosmetic_slug;
      entry.ringArt = rive.get(row.cosmetic_slug) ?? null;
    }
    if (row.kind === "aura") {
      entry.aura = row.cosmetic_slug;
      entry.auraArt = rive.get(row.cosmetic_slug) ?? null;
    }
    wear.set(row.player_id, entry);
  }
  return wear;
}

/** What is worn right now, one slug or null per category. */
export async function getEquips(
  playerId: string,
): Promise<Record<EquipKind, string | null>> {
  const empty = Object.fromEntries(EQUIP_KINDS.map((kind) => [kind, null])) as Record<
    EquipKind,
    string | null
  >;
  if (!isSupabaseConfigured()) return empty;

  const { data, error } = await getSupabaseAdmin()
    .from("player_equips")
    .select("kind, cosmetic_slug")
    .eq("player_id", playerId);

  if (error) {
    console.error("Could not read the player's equips", error);
    return empty;
  }

  for (const row of data ?? []) {
    if (isEquipKind(row.kind)) empty[row.kind] = row.cosmetic_slug;
  }
  return empty;
}

/**
 * `getEquips`, for DISPLAY: empty for a tier that no longer wears
 * cosmetics, so a lapsed Pro's look comes off every profile and card
 * the moment the tier drops — while the rows survive underneath for the
 * day they resubscribe. The dressing room (`customizeSections`) keeps
 * reading the raw rows on purpose: it shows what is waiting.
 */
export async function dressedEquipsFor(
  playerId: string,
): Promise<Record<EquipKind, string | null>> {
  const equips = await getEquips(playerId);
  if (!isSupabaseConfigured()) return equips;

  const { data: wearer } = await getSupabaseAdmin()
    .from("players")
    .select("tier")
    .eq("id", playerId)
    .maybeSingle();

  if (tierAllows(wearer?.tier ?? null, "cosmetics")) return equips;

  return Object.fromEntries(Object.keys(equips).map((kind) => [kind, null])) as Record<
    EquipKind,
    string | null
  >;
}

export type EquipOutcome = "equipped" | "cleared" | "not-owned" | "not-pro" | "failed";

/**
 * Wears one cosmetic, or clears the slot with null.
 *
 * Ownership goes through ownsCosmetic, the single decider - which is
 * exactly what keeps a draft wearable by the founder's granted account
 * and by nobody else, price zero or not.
 *
 * WEARING is a Pro capability — the founder's pricing pivot: the free
 * tier customizes nothing but the profile picture. The gate lives here
 * because both clients (the web action and the app's route) call this
 * one function. Clearing a slot stays free: taking something off is
 * not customization, and a lapsed player must always be able to undress.
 */
export async function setEquip(
  playerId: string,
  kind: EquipKind,
  slug: string | null,
): Promise<EquipOutcome> {
  if (!isSupabaseConfigured()) return "failed";

  const admin = getSupabaseAdmin();

  if (slug === null) {
    const { error } = await admin
      .from("player_equips")
      .delete()
      .eq("player_id", playerId)
      .eq("kind", kind);
    if (error) {
      console.error("Could not clear the equip", error);
      return "failed";
    }
    return "cleared";
  }

  const { data: wearer } = await admin
    .from("players")
    .select("tier")
    .eq("id", playerId)
    .maybeSingle();

  if (!tierAllows(wearer?.tier ?? null, "cosmetics")) return "not-pro";

  const { data: item } = await admin
    .from("cosmetics")
    .select("slug, kind, cost_embers, status")
    .eq("slug", slug)
    .eq("kind", kind)
    .maybeSingle();

  if (!item) return "not-owned";
  if (!ownsCosmetic(item, await ownedCosmetics(playerId))) return "not-owned";

  const { error } = await admin.from("player_equips").upsert(
    {
      player_id: playerId,
      kind,
      cosmetic_slug: slug,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "player_id,kind" },
  );

  if (error) {
    console.error("Could not equip", error);
    return "failed";
  }

  /*
   * The circle around the picture has ONE owner. Wearing a ring takes
   * the old avatar frame off rather than hiding it underneath - the
   * founder cleared his ring and a frame he could not see anywhere
   * "came back", which read as card equips touching his picture.
   * equipCosmetic does the same in the other direction.
   */
  if (kind === "ring") {
    const { error: frameError } = await admin
      .from("players")
      .update({ equipped_avatar_frame: null })
      .eq("id", playerId);
    if (frameError) {
      console.error("Could not take off the old avatar frame", frameError);
    }
  }

  return "equipped";
}

export interface CustomizeItem {
  slug: string;
  name: string;
  description: string;
  status: "live" | "draft";
  owned: boolean;
  equipped: boolean;
  /** Set when this one is a dropped-in file rather than CSS art. */
  art: CosmeticArtFile | null;
}

/**
 * The Rive files behind what a player is wearing, one slot at a time.
 *
 * The worn surfaces take slugs; this turns those slugs into the files
 * that draw them, in a single read, so a profile page asks once for
 * everything it is about to draw.
 */
export async function wornArtFor(
  equips: Record<EquipKind, string | null>,
): Promise<Record<EquipKind, CosmeticArtFile | null>> {
  const found = await artFilesFor(Object.values(equips));
  return Object.fromEntries(
    EQUIP_KINDS.map((kind) => {
      const slug = equips[kind];
      return [kind, slug ? (found.get(slug) ?? null) : null];
    }),
  ) as Record<EquipKind, CosmeticArtFile | null>;
}

export interface CustomizeSection {
  kind: EquipKind;
  items: CustomizeItem[];
}

/**
 * Everything the customize screen offers, per category.
 *
 * Live items appear for everyone (locked ones too - seeing what exists
 * is the store's advertisement); DRAFT items appear only for a player
 * whose grant reaches them, per the founder's rule above.
 */
export async function customizeSections(playerId: string): Promise<{
  sections: CustomizeSection[];
  equips: Record<EquipKind, string | null>;
  /** Whether this player's tier may WEAR any of it. The catalogue shows
      either way — seeing what exists is the store's advertisement. */
  customizationAllowed: boolean;
}> {
  const equips = await getEquips(playerId);
  if (!isSupabaseConfigured()) {
    return { sections: [], equips, customizationAllowed: false };
  }

  const [{ data: rows, error }, owned, { data: wearer }] = await Promise.all([
    getSupabaseAdmin()
      .from("cosmetics")
      .select("*")
      .in("kind", [...EQUIP_KINDS])
      .order("sort_order"),
    ownedCosmetics(playerId),
    getSupabaseAdmin().from("players").select("tier").eq("id", playerId).maybeSingle(),
  ]);

  const customizationAllowed = tierAllows(wearer?.tier ?? null, "cosmetics");

  if (error || !rows) {
    console.error("Could not read the customize catalogue", error);
    return { sections: [], equips, customizationAllowed };
  }

  const sections = EQUIP_KINDS.map((kind) => ({
    kind,
    items: (rows as CosmeticRow[])
      .filter((row) => row.kind === kind)
      .filter((row) => row.status === "live" || owned.unlockedDraft)
      .map((row) => ({
        slug: row.slug,
        name: row.name,
        description: row.description,
        status: row.status,
        owned: ownsCosmetic(row, owned),
        equipped: equips[kind] === row.slug,
        art: artFileOf(row),
      })),
  })).filter((section) => section.items.length > 0);

  return { sections, equips, customizationAllowed };
}
