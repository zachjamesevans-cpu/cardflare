import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { artFileOf, type CosmeticArtFile } from "@/lib/players/art-files";
import { tidyCosmeticName } from "@/lib/players/cosmetic-names";
import { slugFromName } from "./catalog-schema";
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
  /** css: a rule in cosmetic-art.css. rive or svg: a dropped-in file. */
  artKind: "css" | "rive" | "svg";
  /** The file to draw, when this one was dropped in. */
  art: CosmeticArtFile | null;
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
    artKind: row.art_kind,
    art: artFileOf(row),
  }));
}

export type CreateOutcome = { ok: true; slug: string } | { ok: false; message: string };

/**
 * A brand new cosmetic, made from a dropped-in file.
 *
 * Lands as a DRAFT every time, whatever the console asks: a cosmetic
 * that goes live the instant a file uploads is one nobody looked at
 * first. The founder flips it live from the same grid he judges it in.
 *
 * The naming rule is enforced here rather than trusted: "no need to
 * have 'edge' after everything" is a standing instruction that applies
 * to every future cosmetic, and this is now one of the doors future
 * cosmetics come through.
 */
export async function createCosmetic(input: {
  name: string;
  kind: CatalogKind;
  description?: string;
  artboard?: string | null;
  stateMachine?: string | null;
}): Promise<CreateOutcome> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "The database is not configured." };
  }

  const name = tidyCosmeticName(input.kind, input.name);
  if (!name) return { ok: false, message: "Give it a name." };

  const base = slugFromName(name);
  if (!base) return { ok: false, message: "That name has no letters in it." };

  /* Slugs carry their category, the way every seeded one does:
     ring-inferno, border-gold, aura-hearts. Nameplates are the one
     exception in the seed, and it is kept so old and new agree. */
  const prefix = input.kind === "nameplate" ? "name" : input.kind;
  const slug = `${prefix}-${base}`.slice(0, 40);

  const admin = getSupabaseAdmin();

  const { data: clash } = await admin
    .from("cosmetics")
    .select("slug")
    .eq("slug", slug)
    .maybeSingle();

  if (clash) {
    return {
      ok: false,
      message: `There is already a cosmetic at ${slug}. Give this one a different name.`,
    };
  }

  /* Last in its category, so a new drop never reorders the grid. */
  const { data: last } = await admin
    .from("cosmetics")
    .select("sort_order")
    .eq("kind", input.kind)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  /*
   * A description is required by the schema (1 to 200 characters) and
   * shown under the name in the console and the store. Blank falls back
   * to the category's own line rather than to an empty string, which
   * the check constraint would refuse - the probe caught exactly that.
   */
  const description =
    (input.description ?? "").trim().slice(0, 200) ||
    KIND_LABELS[input.kind]?.blurb ||
    "A cosmetic.";

  const { error } = await admin.from("cosmetics").insert({
    slug,
    kind: input.kind,
    name,
    description,
    cost_embers: 0,
    requires_earned: null,
    sort_order: (last?.sort_order ?? 0) + 10,
    status: "draft",
    /* CSS until the file lands: the row exists first so the upload has
       something to attach to, and the check constraint forbids
       claiming 'rive' with no file. storeRiveArt flips it. */
    art_kind: "css",
    rive_path: null,
    svg_path: null,
    rive_artboard: input.artboard || null,
    rive_state_machine: input.stateMachine || null,
  });

  if (error) {
    console.error("Could not create the cosmetic", error);
    return { ok: false, message: "Could not create it. Try again in a moment." };
  }

  return { ok: true, slug };
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
    .select("slug, rive_path")
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

  /* The file goes with the row. Deleting is deliberate here - the
     founder's rule for this grid: "deleting will remove it from the
     server database entirely" - so leaving the object behind would be
     litter nobody can see or reach. */
  if (existing.rive_path) {
    await getSupabaseAdmin().storage.from("avatars").remove([existing.rive_path]);
  }

  return "deleted";
}

export type RenameOutcome = { ok: true; name: string } | { ok: false; message: string };

/**
 * Gives a cosmetic a different name, everywhere at once.
 *
 * The founder's ask: "give me the option to rename any cosmetic when
 * I'm in the admin console. This update will change it across all
 * platforms live - the app, website, etc."
 *
 * It does, and without any syncing: every surface reads the name off
 * this row. The website's shop, Customize and profile all select it,
 * and the app's /api/v1/customize hands the same column straight to the
 * phone. Nothing caches a copy, so there is nothing to go stale.
 *
 * What does NOT move is the slug. That is the identity the rest of the
 * database points at - player_cosmetics, pack_series_items,
 * player_equips, and the `.cfa-<slug>` rule that draws the art - so a
 * rename that renamed the slug too would take a cosmetic somebody
 * bought straight off their profile. The name is the label; the slug is
 * the thing.
 *
 * The naming rule applies here the same as at the upload door: this is
 * a door future names come through, and "no need to have 'edge' after
 * everything" was given as a standing instruction.
 */
export async function renameCosmetic(
  slug: string,
  typed: string,
): Promise<RenameOutcome> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "The database is not configured." };
  }

  const admin = getSupabaseAdmin();

  const { data: existing } = await admin
    .from("cosmetics")
    .select("slug, kind, name")
    .eq("slug", slug)
    .maybeSingle();

  if (!existing) return { ok: false, message: "That cosmetic is gone." };

  const name = tidyCosmeticName(existing.kind, typed);
  if (!name) return { ok: false, message: "Give it a name." };
  if (name === existing.name) return { ok: true, name };

  const { error } = await admin.from("cosmetics").update({ name }).eq("slug", slug);

  if (error) {
    console.error("Could not rename the cosmetic", error);
    return { ok: false, message: "Could not rename it. Try again in a moment." };
  }

  return { ok: true, name };
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
