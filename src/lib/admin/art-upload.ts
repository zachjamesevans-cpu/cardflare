import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { checkRiveFile, RIVE_REJECTION_COPY } from "./rive-file";
import { artDocument, HTML_REJECTION_COPY, sanitizeHtml } from "./html-file";
import { sanitizeSvg, SVG_REJECTION_COPY } from "./svg-file";

/**
 * Cosmetic art in storage: dropped in from the console, served to every
 * surface that draws a cosmetic.
 *
 * Three shapes through one door. A .riv is stored as it arrived. A
 * drawing - typed in as an .svg, or converted from a Figma .tsx in the
 * founder's browser - is scrubbed and stored as text. HTML art, which
 * is what a Figma export turns out to be whenever it animates with
 * divs and keyframes rather than shapes, is scrubbed and stored as a
 * whole small document, policy header and all, so the frame that draws
 * it needs to know nothing.
 *
 * The upload follows the pack-art path exactly, because that one is
 * proven on the founder's network: write, read back, compare, and only
 * then record the path. A half-uploaded ornament that reads as present
 * is worse than a failed upload that says so.
 */

/** Where a cosmetic's file lives. Timestamped, so a replacement never
    fights a cached copy of the old one. */
function objectPath(slug: string, extension: "riv" | "svg" | "html"): string {
  return `cosmetics/${slug}-${Date.now()}.${extension}`;
}

/** Every art column, so setting one always clears the other three. */
const NO_ART = {
  rive_path: null,
  svg_path: null,
  html_path: null,
} as const;

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

  const before = await currentArt(slug);

  const { error: saveError } = await admin
    .from("cosmetics")
    .update({
      ...NO_ART,
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
  await forgetOldArt(before, path);

  return { ok: true, path };
}

/**
 * Stores markup art - a drawing or an HTML animation - for a cosmetic
 * that already exists.
 *
 * Scrubbed before it is written, not after: what lands in storage is
 * what players are served. The renderer is the second lock on the same
 * door either way, an `<img>` for a drawing and a script-free sandbox
 * for HTML, so a hole in the scrubber is still not a hole in the page.
 *
 * HTML is wrapped in its document here rather than at render time, so
 * the policy header travels WITH the art. The website and the app both
 * just point a frame at the URL, and neither can accidentally serve it
 * without its policy.
 */
export async function storeMarkupArt(
  slug: string,
  kind: "svg" | "html",
  markup: string,
): Promise<ArtStoreResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Storage is not configured." };
  }

  let body: string;
  let contentType: string;

  if (kind === "svg") {
    const clean = sanitizeSvg(markup);
    if (!clean.ok) return { ok: false, message: SVG_REJECTION_COPY[clean.reason] };
    body = clean.svg;
    contentType = "image/svg+xml";
  } else {
    const clean = sanitizeHtml(markup);
    if (!clean.ok) return { ok: false, message: HTML_REJECTION_COPY[clean.reason] };
    body = artDocument(clean.html);
    /*
     * No charset parameter: the bucket's allowed_mime_types is an
     * exact-match list, so "text/html; charset=utf-8" would be
     * refused where "text/html" is accepted. The document carries its
     * own <meta charset> anyway, and the proxy adds the parameter
     * back when it serves the object.
     */
    contentType = "text/html";
  }

  const admin = getSupabaseAdmin();
  const path = objectPath(slug, kind);
  const bytes = new TextEncoder().encode(body);

  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(path, new Blob([bytes], { type: contentType }), {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    console.error("Could not store the art", uploadError);
    return { ok: false, message: "That did not upload. Try again in a moment." };
  }

  const { data: readBack } = await admin.storage.from("avatars").download(path);
  const landed = readBack ? await readBack.text() : null;

  if (landed !== body) {
    await admin.storage.from("avatars").remove([path]);
    return { ok: false, message: "The upload did not land intact. Try again." };
  }

  const before = await currentArt(slug);

  const { error: saveError } = await admin
    .from("cosmetics")
    .update({
      ...NO_ART,
      art_kind: kind,
      ...(kind === "svg" ? { svg_path: path } : { html_path: path }),
    })
    .eq("slug", slug);

  if (saveError) {
    console.error("Could not record the art", saveError);
    await admin.storage.from("avatars").remove([path]);
    return { ok: false, message: "Could not record the file against the cosmetic." };
  }

  await forgetOldArt(before, path);

  return { ok: true, path };
}

/** Whatever the row pointed at before this upload, so it can be tidied. */
async function currentArt(slug: string): Promise<(string | null)[]> {
  const { data } = await getSupabaseAdmin()
    .from("cosmetics")
    .select("rive_path, svg_path, html_path")
    .eq("slug", slug)
    .maybeSingle();

  return [data?.rive_path ?? null, data?.svg_path ?? null, data?.html_path ?? null];
}

/**
 * Deletes replaced objects, never the one just written, and never a
 * file that ships in the repo (those start with a slash and belong to
 * the deployment, not to storage).
 */
async function forgetOldArt(paths: (string | null)[], keep: string): Promise<void> {
  const stale = paths.filter(
    (path): path is string => Boolean(path) && path !== keep && !path!.startsWith("/"),
  );
  if (stale.length === 0) return;
  await getSupabaseAdmin().storage.from("avatars").remove(stale);
}

/* Reading art files lives in lib/players/art-files.ts: every surface
   reads them, only this file writes them. */
