import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * Pack sets, built in the console.
 *
 * Origin lives in code (src/lib/packs/origin) and stays there. Everything
 * the founder builds from here lives in the database instead, because a
 * set is content: a name, a set number, what is inside, how likely each
 * thing is, when it opens and what the wrapper looks like. None of that
 * should need a deploy.
 *
 * No admin check in this file — the action layer does it, as everywhere
 * else under lib/admin.
 */

/**
 * sharp, fetched only when an image is actually being processed.
 *
 * Lazy for the same reason `src/lib/players/profile.ts` is lazy: a
 * top-level import of a native module makes every page that imports
 * this file fail to render when the binary is missing on the host,
 * rather than failing the one operation that needs it. That took the
 * whole site down once.
 */
type SharpFactory = (typeof import("sharp"))["default"];

async function loadSharp(): Promise<SharpFactory> {
  try {
    return (await import("sharp")).default;
  } catch (cause) {
    throw new Error(
      "Image encoding is unavailable: the sharp native module failed to load.",
      { cause },
    );
  }
}

export const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;
export type Rarity = (typeof RARITIES)[number];

export interface PackSetItem {
  cosmeticSlug: string;
  name: string;
  kind: string;
  rarity: Rarity;
  /** Draw weight, in percent. */
  weight: number;
  /** A draft item in a live set would be unwinnable; the console says so. */
  status: "live" | "draft";
}

export interface PackSet {
  slug: string;
  name: string;
  setNumber: number;
  description: string;
  priceEmbers: number;
  slots: number;
  releaseAt: string | null;
  artPath: string | null;
  /** The art as something an <img> can load, or null for the default. */
  artUrl: string | null;
  status: "live" | "draft";
  items: PackSetItem[];
  /** Weights added up. Anything but 100 and the set cannot go live. */
  weightTotal: number;
}

/** Every set the console knows about, newest set number first. */
export async function listPackSets(): Promise<PackSet[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = getSupabaseAdmin();

  const [{ data: series, error }, { data: items }, { data: cosmetics }] =
    await Promise.all([
      admin.from("pack_series").select("*").order("set_number", { ascending: false }),
      admin.from("pack_series_items").select("*"),
      admin.from("cosmetics").select("slug, name, kind, status"),
    ]);

  if (error || !series) {
    console.error("Could not read the pack sets", error);
    return [];
  }

  const byslug = new Map((cosmetics ?? []).map((row) => [row.slug, row]));

  return series.map((row) => {
    const mine = (items ?? [])
      .filter((item) => item.series_slug === row.slug)
      .map((item) => {
        const cosmetic = byslug.get(item.cosmetic_slug);
        return {
          cosmeticSlug: item.cosmetic_slug,
          name: cosmetic?.name ?? item.cosmetic_slug,
          kind: cosmetic?.kind ?? "unknown",
          rarity: item.rarity as Rarity,
          weight: Number(item.weight),
          status: (cosmetic?.status ?? "draft") as "live" | "draft",
        };
      })
      .sort((a, b) => b.weight - a.weight);

    return {
      slug: row.slug,
      name: row.name,
      setNumber: row.set_number,
      description: row.description,
      priceEmbers: row.price_embers,
      slots: row.slots,
      releaseAt: row.release_at,
      artPath: row.art_path,
      artUrl: packArtSrc(row.art_path),
      status: row.status as "live" | "draft",
      items: mine,
      weightTotal: mine.reduce((sum, item) => sum + item.weight, 0),
    };
  });
}

export async function createPackSet(input: {
  slug: string;
  name: string;
  setNumber: number;
  description: string;
  priceEmbers: number;
  slots: number;
  releaseAt: string | null;
}): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin().from("pack_series").insert({
    slug: input.slug,
    name: input.name,
    set_number: input.setNumber,
    description: input.description,
    price_embers: input.priceEmbers,
    slots: input.slots,
    release_at: input.releaseAt,
  });

  if (error) {
    console.error("Could not create the pack set", error);
    return false;
  }
  return true;
}

export async function updatePackSet(
  slug: string,
  patch: {
    name?: string;
    description?: string;
    priceEmbers?: number;
    slots?: number;
    releaseAt?: string | null;
    artPath?: string | null;
  },
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("pack_series")
    .update({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.priceEmbers !== undefined ? { price_embers: patch.priceEmbers } : {}),
      ...(patch.slots !== undefined ? { slots: patch.slots } : {}),
      ...(patch.releaseAt !== undefined ? { release_at: patch.releaseAt } : {}),
      ...(patch.artPath !== undefined ? { art_path: patch.artPath } : {}),
    })
    .eq("slug", slug);

  if (error) {
    console.error("Could not update the pack set", error);
    return false;
  }
  return true;
}

export async function deletePackSet(slug: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("pack_series")
    .delete()
    .eq("slug", slug);

  if (error) {
    console.error("Could not delete the pack set", error);
    return false;
  }
  return true;
}

/** Adds a cosmetic to a set, or changes its rarity and weight if already in. */
export async function putPackSetItem(
  seriesSlug: string,
  cosmeticSlug: string,
  rarity: Rarity,
  weight: number,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin().from("pack_series_items").upsert(
    {
      series_slug: seriesSlug,
      cosmetic_slug: cosmeticSlug,
      rarity,
      weight,
    },
    { onConflict: "series_slug,cosmetic_slug" },
  );

  if (error) {
    console.error("Could not put the item in the set", error);
    return false;
  }
  return true;
}

export async function removePackSetItem(
  seriesSlug: string,
  cosmeticSlug: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("pack_series_items")
    .delete()
    .eq("series_slug", seriesSlug)
    .eq("cosmetic_slug", cosmeticSlug);

  if (error) {
    console.error("Could not take the item out of the set", error);
    return false;
  }
  return true;
}

export type PublishOutcome =
  "published" | "unpublished" | "weights" | "empty" | "drafts" | "failed";

/**
 * Puts a set on sale, or takes it off.
 *
 * Publishing is refused unless the set is actually shippable, because a
 * broken set is only discovered by a player spending Embers on it:
 *
 *  - weights must total exactly 100, or the draw maths is a lie;
 *  - it must hold at least as many items as it has slots, since a pack
 *    never repeats an item within itself;
 *  - every item must itself be live, or a pull would hand somebody a
 *    cosmetic the rest of the product refuses to render.
 *
 * Publishing a set does NOT flip its cosmetics live — that is the
 * founder's call, item by item, so the list here names what is left.
 */
export async function setPackSetStatus(
  slug: string,
  status: "live" | "draft",
): Promise<PublishOutcome> {
  if (!isSupabaseConfigured()) return "failed";

  if (status === "live") {
    const set = (await listPackSets()).find((candidate) => candidate.slug === slug);
    if (!set) return "failed";
    if (set.items.length < set.slots) return "empty";
    if (Math.abs(set.weightTotal - 100) > 0.001) return "weights";
    if (set.items.some((item) => item.status === "draft")) return "drafts";
  }

  const { error } = await getSupabaseAdmin()
    .from("pack_series")
    .update({ status })
    .eq("slug", slug);

  if (error) {
    console.error("Could not change the set's status", error);
    return "failed";
  }

  return status === "live" ? "published" : "unpublished";
}

/* A pack wrapper, at the proportions the shop draws it. */
const ART_WIDTH = 480;
const ART_HEIGHT = 704;
export const PACK_ART_MAX_BYTES = 6 * 1024 * 1024;

/**
 * Stores a set's wrapper art.
 *
 * The same pipeline the profile pictures use, for the same reason: an
 * upload that reports success while the bucket holds garbage cost this
 * project five rounds once already. Re-encode with sharp so the bucket
 * only ever holds one format, upload as a Blob rather than a Buffer
 * (a Buffer body has been read as UTF-8 by a deployed runtime, turning
 * every non-text byte into a replacement character), then download it
 * again and byte-compare before recording the path.
 */
export async function setPackArt(
  slug: string,
  file: ArrayBuffer,
): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Storage is not configured." };
  }

  const sharp = await loadSharp();

  let encoded: Buffer;
  try {
    encoded = await sharp(Buffer.from(file))
      .resize(ART_WIDTH, ART_HEIGHT, { fit: "cover", position: "centre" })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    return { ok: false, message: "That file could not be read as an image." };
  }

  const admin = getSupabaseAdmin();
  const path = `packs/${slug}-${Date.now()}.jpg`;

  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(path, new Blob([new Uint8Array(encoded)], { type: "image/jpeg" }), {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (uploadError) {
    console.error("Could not store the pack art", uploadError);
    return { ok: false, message: "That did not upload. Try again in a moment." };
  }

  const { data: readBack } = await admin.storage.from("avatars").download(path);
  const landed = readBack ? Buffer.from(await readBack.arrayBuffer()) : null;

  if (!landed || !landed.equals(encoded)) {
    await admin.storage.from("avatars").remove([path]);
    return { ok: false, message: "The upload did not land intact. Try again." };
  }

  /* The old object goes only once the new one is proven. */
  const { data: before } = await admin
    .from("pack_series")
    .select("art_path")
    .eq("slug", slug)
    .maybeSingle();

  const saved = await updatePackSet(slug, { artPath: path });
  if (!saved) {
    await admin.storage.from("avatars").remove([path]);
    return { ok: false, message: "Could not record the art." };
  }

  if (before?.art_path && before.art_path !== path) {
    await admin.storage.from("avatars").remove([before.art_path]);
  }

  return { ok: true, path };
}

/** A storage path turned into something an <img> can load. */
export function packArtSrc(path: string | null): string | null {
  if (!path) return null;
  const { data } = getSupabaseAdmin().storage.from("avatars").getPublicUrl(path);
  return data?.publicUrl ?? null;
}
