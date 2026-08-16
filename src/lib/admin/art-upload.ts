import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { checkRiveFile, RIVE_REJECTION_COPY } from "./rive-file";
import { sanitizeSvg, SVG_REJECTION_COPY } from "./svg-file";

/**
 * Cosmetic art in storage: dropped in from the console, served to every
 * surface that draws a cosmetic.
 *
 * Two file types through one door. A .riv is stored as it arrived; an
 * SVG - typed in as a drawing, or converted from a Figma .tsx in the
 * founder's browser - is scrubbed first and stored as text.
 *
 * The upload follows the pack-art path exactly, because that one is
 * proven on the founder's network: write, read back, compare, and only
 * then record the path. A half-uploaded ornament that reads as present
 * is worse than a failed upload that says so.
 */

/** Where a cosmetic's file lives. Timestamped, so a replacement never
    fights a cached copy of the old one. */
function objectPath(slug: string, extension: "riv" | "svg"): string {
  return `cosmetics/${slug}-${Date.now()}.${extension}`;
}

export type ArtStoreResult =
  { ok: true; path: string } | { ok: false; message: string };

/**
 * Stores a .riv for a cosmetic that already exists, and points the row
 * at it. Used by both the create flow (row first, then file) and the
 * replace flow (new file over an old one).
 */
export async function storeRiveArt(
  slug: string,
  file: ArrayBuffer,
  meta?: { artboard?: string | null; stateMachine?: string | null },
): Promise<ArtStoreResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Storage is not configured." };
  }

  const bytes = new Uint8Array(file);
  const rejected = checkRiveFile(bytes);
  if (rejected) return { ok: false, message: RIVE_REJECTION_COPY[rejected] };

  const admin = getSupabaseAdmin();
  const path = objectPath(slug, "riv");

  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(path, new Blob([bytes], { type: "application/octet-stream" }), {
      contentType: "application/octet-stream",
      upsert: true,
    });

  if (uploadError) {
    console.error("Could not store the Rive file", uploadError);
    return { ok: false, message: "That did not upload. Try again in a moment." };
  }

  /* Read it back and compare, byte for byte. */
  const { data: readBack } = await admin.storage.from("avatars").download(path);
  const landed = readBack ? new Uint8Array(await readBack.arrayBuffer()) : null;

  const intact =
    landed !== null &&
    landed.length === bytes.length &&
    landed.every((byte, index) => byte === bytes[index]);

  if (!intact) {
    await admin.storage.from("avatars").remove([path]);
    return { ok: false, message: "The upload did not land intact. Try again." };
  }

  const { data: before } = await admin
    .from("cosmetics")
    .select("rive_path, svg_path")
    .eq("slug", slug)
    .maybeSingle();

  const { error: saveError } = await admin
    .from("cosmetics")
    .update({
      art_kind: "rive",
      rive_path: path,
      /* One art source at a time: the check constraint says so, and a
         cosmetic that used to be a drawing is now an animation. */
      svg_path: null,
      ...(meta?.artboard !== undefined ? { rive_artboard: meta.artboard || null } : {}),
      ...(meta?.stateMachine !== undefined
        ? { rive_state_machine: meta.stateMachine || null }
        : {}),
    })
    .eq("slug", slug);

  if (saveError) {
    console.error("Could not record the Rive art", saveError);
    await admin.storage.from("avatars").remove([path]);
    return { ok: false, message: "Could not record the file against the cosmetic." };
  }

  /* The old object goes only once the new one is proven and recorded. */
  await removeStoredArt(before?.rive_path ?? null, path);
  await removeStoredArt(before?.svg_path ?? null, path);

  return { ok: true, path };
}

/**
 * Stores a drawing for a cosmetic that already exists.
 *
 * The SVG is scrubbed before it is written, not after: what lands in
 * storage is what players are served, and the scrubber is the only
 * thing standing between an uploaded document and somebody else's
 * profile. (The renderer draws it in an `<img>` as well, which is the
 * second lock on the same door.)
 */
export async function storeSvgArt(
  slug: string,
  markup: string,
): Promise<ArtStoreResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Storage is not configured." };
  }

  const clean = sanitizeSvg(markup);
  if (!clean.ok) return { ok: false, message: SVG_REJECTION_COPY[clean.reason] };

  const admin = getSupabaseAdmin();
  const path = objectPath(slug, "svg");
  const bytes = new TextEncoder().encode(clean.svg);

  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(path, new Blob([bytes], { type: "image/svg+xml" }), {
      contentType: "image/svg+xml",
      upsert: true,
    });

  if (uploadError) {
    console.error("Could not store the drawing", uploadError);
    return { ok: false, message: "That did not upload. Try again in a moment." };
  }

  const { data: readBack } = await admin.storage.from("avatars").download(path);
  const landed = readBack ? await readBack.text() : null;

  if (landed !== clean.svg) {
    await admin.storage.from("avatars").remove([path]);
    return { ok: false, message: "The upload did not land intact. Try again." };
  }

  const { data: before } = await admin
    .from("cosmetics")
    .select("rive_path, svg_path")
    .eq("slug", slug)
    .maybeSingle();

  const { error: saveError } = await admin
    .from("cosmetics")
    .update({ art_kind: "svg", svg_path: path, rive_path: null })
    .eq("slug", slug);

  if (saveError) {
    console.error("Could not record the drawing", saveError);
    await admin.storage.from("avatars").remove([path]);
    return { ok: false, message: "Could not record the file against the cosmetic." };
  }

  await removeStoredArt(before?.svg_path ?? null, path);
  await removeStoredArt(before?.rive_path ?? null, path);

  return { ok: true, path };
}

/**
 * Deletes a replaced object, never the one just written, and never a
 * file that ships in the repo (those start with a slash and belong to
 * the deployment, not to storage).
 */
async function removeStoredArt(path: string | null, keep: string): Promise<void> {
  if (!path || path === keep || path.startsWith("/")) return;
  await getSupabaseAdmin().storage.from("avatars").remove([path]);
}

/* Reading art files lives in lib/players/art-files.ts: every surface
   reads them, only this file writes them. */
