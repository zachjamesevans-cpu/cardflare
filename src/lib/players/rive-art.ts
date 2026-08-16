import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * Reading Rive cosmetics: what a canvas needs to play one.
 *
 * Lives with the players' code rather than the console's because every
 * player-facing surface reads it - profiles, rooms, the customize
 * tiles - and only the console writes it. The write path is in
 * lib/admin/rive.ts.
 */

/** Everything a canvas needs to play one cosmetic's file. */
export interface RiveArt {
  url: string;
  /** Which artboard to play, or null for the file's default. */
  artboard: string | null;
  /** Which state machine to run, or null for the file's default. */
  stateMachine: string | null;
}

/** A storage path turned into something the Rive runtime can fetch. */
export function riveArtSrc(path: string | null): string | null {
  if (!path || !isSupabaseConfigured()) return null;
  const { data } = getSupabaseAdmin().storage.from("avatars").getPublicUrl(path);
  return data?.publicUrl ?? null;
}

/** The same, from a whole row, for callers that already read one. */
export function riveArtOf(row: {
  art_kind?: "css" | "rive";
  rive_path?: string | null;
  rive_artboard?: string | null;
  rive_state_machine?: string | null;
}): RiveArt | null {
  if (row.art_kind !== "rive") return null;
  const url = riveArtSrc(row.rive_path ?? null);
  if (!url) return null;
  return {
    url,
    artboard: row.rive_artboard ?? null,
    stateMachine: row.rive_state_machine ?? null,
  };
}

/**
 * The Rive art for a batch of slugs, for surfaces that draw worn
 * cosmetics. One query for the whole page rather than one per piece,
 * and CSS cosmetics are simply absent from the map.
 */
export async function riveArtFor(
  slugs: (string | null)[],
): Promise<Map<string, RiveArt>> {
  const art = new Map<string, RiveArt>();
  const wanted = [...new Set(slugs.filter((slug): slug is string => Boolean(slug)))];
  if (!isSupabaseConfigured() || wanted.length === 0) return art;

  const { data, error } = await getSupabaseAdmin()
    .from("cosmetics")
    .select("slug, art_kind, rive_path, rive_artboard, rive_state_machine")
    .eq("art_kind", "rive")
    .in("slug", wanted);

  if (error) {
    console.error("Could not read Rive art", error);
    return art;
  }

  for (const row of data ?? []) {
    const found = riveArtOf(row);
    if (found) art.set(row.slug, found);
  }

  return art;
}
