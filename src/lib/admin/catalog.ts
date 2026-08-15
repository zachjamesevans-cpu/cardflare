import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { CosmeticRow } from "@/lib/supabase/types";

/**
 * The cosmetics catalogue, as the console sees it.
 *
 * Everything in here reads and writes the WHOLE catalogue, drafts
 * included, which is exactly what nothing else in the product is allowed
 * to do. There is no admin check in this file: every caller goes through
 * `requireAdmin` at the action layer first, the same rule as grants.ts.
 */

/** The catalogue's categories, in the order the console lists them. */
export const CATALOG_KINDS = [
  "ring",
  "border",
  "pattern",
  "animation",
  "background",
  "scene",
  "nameplate",
  "title",
  "badge",
  "frame",
  "holo",
  "effect",
] as const;

export type CatalogKind = (typeof CATALOG_KINDS)[number];

/** What each kind is called, and what it dresses. */
export const KIND_LABELS: Record<string, { title: string; blurb: string }> = {
  ring: { title: "Profile borders", blurb: "Drawn around a profile picture." },
  border: { title: "Card borders", blurb: "Drawn around a showcase card." },
  pattern: { title: "Holo patterns", blurb: "The foil across a card's face." },
  animation: { title: "Card animations", blurb: "How a showcase card moves." },
  background: { title: "Showcase backgrounds", blurb: "Behind the showcase rail." },
  scene: { title: "Profile effects", blurb: "Across the whole profile page." },
  nameplate: { title: "Name styles", blurb: "How a username is drawn." },
  title: { title: "Titles", blurb: "The line under a username." },
  badge: { title: "Badges", blurb: "The mark beside a username." },
  frame: { title: "Frames (live)", blurb: "The shipped borders players own." },
  holo: { title: "Holos (live)", blurb: "The shipped foils players own." },
  effect: { title: "Effects (live)", blurb: "The shipped animations players own." },
};

export interface CatalogEntry {
  slug: string;
  kind: string;
  name: string;
  description: string;
  costEmbers: number;
  status: "live" | "draft";
  sortOrder: number;
  /** How many players own it. Zero means deleting costs nobody anything. */
  owners: number;
  /** Which sets it has been put in, by name. */
  inSets: string[];
}

/**
 * The whole catalogue with the two facts the console needs before it can
 * safely offer a Delete button: who owns it, and which sets use it.
 */
export async function catalogForConsole(): Promise<CatalogEntry[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = getSupabaseAdmin();

  const [{ data: rows, error }, { data: owned }, { data: inSets }, { data: series }] =
    await Promise.all([
      admin.from("cosmetics").select("*").order("kind").order("sort_order"),
      admin.from("player_cosmetics").select("cosmetic_slug"),
      admin.from("pack_series_items").select("cosmetic_slug, series_slug"),
      admin.from("pack_series").select("slug, name"),
    ]);

  if (error || !rows) {
    console.error("Could not read the catalogue", error);
    return [];
  }

  const owners = new Map<string, number>();
  for (const row of owned ?? []) {
    owners.set(row.cosmetic_slug, (owners.get(row.cosmetic_slug) ?? 0) + 1);
  }

  const seriesName = new Map((series ?? []).map((row) => [row.slug, row.name]));
  const sets = new Map<string, string[]>();
  for (const row of inSets ?? []) {
    const list = sets.get(row.cosmetic_slug) ?? [];
    list.push(seriesName.get(row.series_slug) ?? row.series_slug);
    sets.set(row.cosmetic_slug, list);
  }

  return (rows as CosmeticRow[]).map((row) => ({
    slug: row.slug,
    kind: row.kind,
    name: row.name,
    description: row.description,
    costEmbers: row.cost_embers,
    status: row.status,
    sortOrder: row.sort_order,
    owners: owners.get(row.slug) ?? 0,
    inSets: sets.get(row.slug) ?? [],
  }));
}

export type DeleteOutcome = "deleted" | "owned" | "missing" | "failed";

/**
 * Removes a cosmetic from the catalogue for good.
 *
 * The founder's plan is to walk the draft list and throw away whatever is
 * not good enough, so this has to be a real delete rather than a hide.
 *
 * It REFUSES when a player owns the thing. The foreign keys would happily
 * cascade — `player_cosmetics` is ON DELETE CASCADE — which is precisely
 * the danger: one click could take a cosmetic somebody spent Embers on
 * out of their profile with no way back. Curating drafts nobody owns is
 * safe; deleting owned goods is not a thing a button should do quietly.
 * Membership of a pack set is not a blocker: that row cascades away and
 * the set is edited in the console anyway.
 */
export async function deleteCosmetic(slug: string): Promise<DeleteOutcome> {
  if (!isSupabaseConfigured()) return "failed";

  const admin = getSupabaseAdmin();

  const { data: existing } = await admin
    .from("cosmetics")
    .select("slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!existing) return "missing";

  const { count } = await admin
    .from("player_cosmetics")
    .select("player_id", { count: "exact", head: true })
    .eq("cosmetic_slug", slug);

  if ((count ?? 0) > 0) return "owned";

  const { error } = await admin.from("cosmetics").delete().eq("slug", slug);

  if (error) {
    console.error("Could not delete the cosmetic", error);
    return "failed";
  }

  return "deleted";
}

/** Flips one cosmetic between the catalogue and the shop floor. */
export async function setCosmeticStatus(
  slug: string,
  status: "live" | "draft",
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("cosmetics")
    .update({ status })
    .eq("slug", slug);

  if (error) {
    console.error("Could not change the cosmetic's status", error);
    return false;
  }
  return true;
}
