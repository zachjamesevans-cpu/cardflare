import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * The daily sweep of abandoned picture uploads.
 *
 * The app sends a picture as numbered pieces that wait under
 * `tmp/<player>/<upload>/` in the avatars bucket until commit stitches
 * them and deletes them. A phone that loses signal half way, or a
 * person who backs out of the cropper, never commits - and nothing else
 * ever looked in tmp/ again, so the pieces stayed for good. Anything
 * there older than an hour is an upload nobody is coming back for: a
 * real one commits within a couple of minutes of starting.
 */

const BUCKET = "avatars";
const STALE_MS = 60 * 60 * 1000;
/** Storage lists a page at a time; these bound one run. */
const PAGE = 1000;

type Admin = ReturnType<typeof getSupabaseAdmin>;

async function list(admin: Admin, prefix: string) {
  const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: PAGE });
  if (error) throw error;
  return data ?? [];
}

export async function sweepStaleAvatarChunks(
  now: number = Date.now(),
): Promise<{ removed: number; failed: boolean }> {
  if (!isSupabaseConfigured()) return { removed: 0, failed: true };

  const admin = getSupabaseAdmin();
  const cutoff = now - STALE_MS;
  let removed = 0;
  let failed = false;

  let players: Awaited<ReturnType<typeof list>>;
  try {
    players = await list(admin, "tmp");
  } catch (error) {
    console.error("Could not list staged avatar uploads", error);
    return { removed: 0, failed: true };
  }

  for (const player of players) {
    try {
      const uploads = await list(admin, `tmp/${player.name}`);
      for (const upload of uploads) {
        const folder = `tmp/${player.name}/${upload.name}`;
        const pieces = await list(admin, folder);
        const stale = pieces
          .filter((piece) => {
            const at = Date.parse(piece.updated_at ?? piece.created_at ?? "");
            /* No timestamp is treated as stale: it cannot be proven fresh,
               and a live upload rewrites its pieces within minutes. */
            return !Number.isFinite(at) || at < cutoff;
          })
          .map((piece) => `${folder}/${piece.name}`);
        if (stale.length === 0) continue;

        const { error } = await admin.storage.from(BUCKET).remove(stale);
        if (error) throw error;
        removed += stale.length;
      }
    } catch (error) {
      failed = true;
      console.error(`Could not sweep staged uploads for ${player.name}`, error);
    }
  }

  return { removed, failed };
}
