import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { checkRiveFile, RIVE_REJECTION_COPY } from "./rive-file";

/**
 * Rive files in storage: dropped in from the console, served to every
 * surface that draws a cosmetic.
 *
 * The upload follows the pack-art path exactly, because that one is
 * proven on the founder's network: write, read back, compare, and only
 * then record the path. A half-uploaded ornament that reads as present
 * is worse than a failed upload that says so.
 */

/** Where a cosmetic's file lives. Timestamped, so a replacement never
    fights a cached copy of the old one. */
function objectPath(slug: string): string {
  return `cosmetics/${slug}-${Date.now()}.riv`;
}

export type RiveStoreResult =
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
): Promise<RiveStoreResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Storage is not configured." };
  }

  const bytes = new Uint8Array(file);
  const rejected = checkRiveFile(bytes);
  if (rejected) return { ok: false, message: RIVE_REJECTION_COPY[rejected] };

  const admin = getSupabaseAdmin();
  const path = objectPath(slug);

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
    .select("rive_path")
    .eq("slug", slug)
    .maybeSingle();

  const { error: saveError } = await admin
    .from("cosmetics")
    .update({
      art_kind: "rive",
      rive_path: path,
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
  if (before?.rive_path && before.rive_path !== path) {
    await admin.storage.from("avatars").remove([before.rive_path]);
  }

  return { ok: true, path };
}

/** Removes a cosmetic's stored file. Called when the cosmetic is deleted. */
export async function removeRiveArt(path: string | null): Promise<void> {
  if (!path || !isSupabaseConfigured()) return;
  await getSupabaseAdmin().storage.from("avatars").remove([path]);
}

/* Reading Rive art lives in lib/players/rive-art.ts: every surface
   reads it, only this file writes it. */
