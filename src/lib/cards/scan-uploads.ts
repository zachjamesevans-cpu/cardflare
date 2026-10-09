import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Photos the app sent in pieces, put back together.
 *
 * On a network that drops request bodies the app sends a photo as
 * numbered base64 chunks in the payload header (see /api/v1/avatar),
 * staged under tmp/scan/ in the avatars bucket. A read stitches them
 * back in order; the pieces are always removed after, however it went.
 */

const DOWNLOAD_CONCURRENCY = 16;

export const scanChunkPath = (playerId: string, upload: string, index: number) =>
  `tmp/scan/${playerId}/${upload}/${String(index).padStart(3, "0")}`;

/** Every piece's path of one upload. */
export function uploadPaths(
  playerId: string,
  upload: { uploadId: string; count: number },
): string[] {
  return Array.from({ length: upload.count }, (_, index) =>
    scanChunkPath(playerId, upload.uploadId, index),
  );
}

/** One upload's pieces, fetched several at a time and kept in order; null when one is missing. */
export async function stitchUpload(paths: string[]): Promise<Uint8Array | null> {
  const admin = getSupabaseAdmin();
  const pieces: (string | null)[] = new Array(paths.length).fill(null);
  let missing = false;
  for (let start = 0; start < paths.length && !missing; start += DOWNLOAD_CONCURRENCY) {
    await Promise.all(
      paths.slice(start, start + DOWNLOAD_CONCURRENCY).map(async (path, offset) => {
        const { data, error } = await admin.storage.from("avatars").download(path);
        if (error || !data) {
          missing = true;
          return;
        }
        pieces[start + offset] = await data.text();
      }),
    );
  }
  if (missing || pieces.some((piece) => piece === null)) return null;
  return new Uint8Array(Buffer.from(pieces.join(""), "base64"));
}

/** The pieces gone, whatever happened to the read. */
export async function removeUploads(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await getSupabaseAdmin()
    .storage.from("avatars")
    .remove(paths)
    .catch(() => {});
}
