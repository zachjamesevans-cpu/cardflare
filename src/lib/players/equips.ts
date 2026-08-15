import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { ownedCosmetics, ownsCosmetic } from "@/lib/players/cosmetics";
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
  profile: ["ring", "nameplate", "title", "badge", "scene"],
  showcase: ["border", "pattern", "animation", "background"],
} as const satisfies Record<string, readonly EquipKind[]>;

export type EquipArea = keyof typeof EQUIP_AREAS;

export function equipArea(value: string | undefined): EquipArea {
  return value === "showcase" ? "showcase" : "profile";
}

/**
 * The worn ring for a batch of players, for rooms and rosters: one
 * query for the whole room, same economics as roomIdentitiesFor.
 */
export async function ringsFor(playerIds: string[]): Promise<Map<string, string>> {
  const rings = new Map<string, string>();
  const ids = [...new Set(playerIds)];
  if (!isSupabaseConfigured() || ids.length === 0) return rings;

  const { data, error } = await getSupabaseAdmin()
    .from("player_equips")
    .select("player_id, cosmetic_slug")
    .eq("kind", "ring")
    .in("player_id", ids);

  if (error) {
    console.error("Could not read worn rings", error);
    return rings;
  }

  for (const row of data ?? []) rings.set(row.player_id, row.cosmetic_slug);
  return rings;
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

export type EquipOutcome = "equipped" | "cleared" | "not-owned" | "failed";

/**
 * Wears one cosmetic, or clears the slot with null.
 *
 * Ownership goes through ownsCosmetic, the single decider - which is
 * exactly what keeps a draft wearable by the founder's granted account
 * and by nobody else, price zero or not.
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
  return "equipped";
}

export interface CustomizeItem {
  slug: string;
  name: string;
  description: string;
  status: "live" | "draft";
  owned: boolean;
  equipped: boolean;
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
}> {
  const equips = await getEquips(playerId);
  if (!isSupabaseConfigured()) return { sections: [], equips };

  const [{ data: rows, error }, owned] = await Promise.all([
    getSupabaseAdmin()
      .from("cosmetics")
      .select("*")
      .in("kind", [...EQUIP_KINDS])
      .order("sort_order"),
    ownedCosmetics(playerId),
  ]);

  if (error || !rows) {
    console.error("Could not read the customize catalogue", error);
    return { sections: [], equips };
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
      })),
  })).filter((section) => section.items.length > 0);

  return { sections, equips };
}
