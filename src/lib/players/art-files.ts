import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * Reading a cosmetic's art file: the Rive animation or the drawing.
 *
 * Lives with the players' code rather than the console's because every
 * player-facing surface reads it - profiles, rooms, the customize
 * tiles - and only the console writes it. The write path is in
 * lib/admin/art-upload.ts.
 */

/** Everything a surface needs to draw one cosmetic's file. */
export interface CosmeticArtFile {
  /**
   * How it draws. `svg` is a drawing, animations and all, shown in an
   * `<img>`. `html` is markup and CSS, shown in a frame with scripting
   * switched off. `rive` plays in a canvas; nothing new arrives as
   * Rive any more, but the ones already in the catalogue still play.
   */
  kind: "rive" | "svg" | "html";
  url: string;
  /** Rive only: which artboard, or null for the file's default. */
  artboard: string | null;
  /** Rive only: which state machine, or null for the file's default. */
  stateMachine: string | null;
}

/**
 * A stored path turned into something the page can fetch.
 *
 * A leading slash means the file ships in the repo (public/cosmetics),
 * which is how art seeded by a migration gets in - a migration cannot
 * carry an upload with it. Anything else is a storage object.
 */
export function artFileSrc(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("/")) return path;
  if (!isSupabaseConfigured()) return null;
  const { data } = getSupabaseAdmin().storage.from("avatars").getPublicUrl(path);
  return data?.publicUrl ?? null;
}

/** The art file behind a row, or null when the row draws itself in CSS. */
export function artFileOf(row: {
  art_kind?: "css" | "rive" | "svg" | "html";
  rive_path?: string | null;
  svg_path?: string | null;
  html_path?: string | null;
  rive_artboard?: string | null;
  rive_state_machine?: string | null;
}): CosmeticArtFile | null {
  if (row.art_kind === "rive") {
    const url = artFileSrc(row.rive_path ?? null);
    return url
      ? {
          kind: "rive",
          url,
          artboard: row.rive_artboard ?? null,
          stateMachine: row.rive_state_machine ?? null,
        }
      : null;
  }

  if (row.art_kind === "svg") {
    const url = artFileSrc(row.svg_path ?? null);
    return url ? { kind: "svg", url, artboard: null, stateMachine: null } : null;
  }

  if (row.art_kind === "html") {
    const url = artFileSrc(row.html_path ?? null);
    return url ? { kind: "html", url, artboard: null, stateMachine: null } : null;
  }

  return null;
}

/**
 * The art files for a batch of slugs, for surfaces that draw worn
 * cosmetics. One query for the whole page rather than one per piece,
 * and CSS cosmetics are simply absent from the map.
 */
export async function artFilesFor(
  slugs: (string | null)[],
): Promise<Map<string, CosmeticArtFile>> {
  const art = new Map<string, CosmeticArtFile>();
  const wanted = [...new Set(slugs.filter((slug): slug is string => Boolean(slug)))];
  if (!isSupabaseConfigured() || wanted.length === 0) return art;

  const { data, error } = await getSupabaseAdmin()
    .from("cosmetics")
    .select(
      "slug, art_kind, rive_path, svg_path, html_path, rive_artboard, rive_state_machine",
    )
    .in("art_kind", ["rive", "svg", "html"])
    .in("slug", wanted);

  if (error) {
    console.error("Could not read cosmetic art files", error);
    return art;
  }

  for (const row of data ?? []) {
    const found = artFileOf(row);
    if (found) art.set(row.slug, found);
  }

  return art;
}
