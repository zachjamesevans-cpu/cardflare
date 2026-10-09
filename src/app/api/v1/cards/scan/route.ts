import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { LIMITS, tooMany } from "@/lib/api/throttle";
import { scanCard, scannerAccess } from "@/lib/cards/scan";
import { SCAN_MAX_BYTES } from "@/lib/cards/scan-rules";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * The card scanner for the app.
 *
 * GET says whether this player sees the scan button ("on"), the door to
 * Pro ("pro-door"), or nothing (null).
 *
 * POST carries the photo the way a profile picture travels, because the
 * app cannot send a body on every network (see /api/v1/avatar): begin,
 * numbered base64 chunks in the payload header, then "read", which
 * stitches the pieces, scans, and drops them. The photo is never kept.
 */

/* The avatar route's proven chunk size, and enough of them for the
   scanner's ceiling once base64 has grown it by a third. */
const CHUNK_MAX_CHARS = 8000;
const CHUNK_MAX_COUNT = Math.ceil((SCAN_MAX_BYTES * 4) / 3 / CHUNK_MAX_CHARS);

const uploadId = z.string().uuid();

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("begin") }),
  z.object({
    action: z.literal("chunk"),
    uploadId,
    index: z
      .number()
      .int()
      .min(0)
      .max(CHUNK_MAX_COUNT - 1),
    data: z
      .string()
      .min(1)
      .max(CHUNK_MAX_CHARS)
      .regex(/^[A-Za-z0-9+/=]+$/),
  }),
  z.object({
    action: z.literal("read"),
    uploadId,
    count: z.number().int().min(1).max(CHUNK_MAX_COUNT),
  }),
]);

const CHUNK_TYPE = "application/octet-stream";
const DOWNLOAD_CONCURRENCY = 16;

const chunkPath = (playerId: string, upload: string, index: number) =>
  `tmp/scan/${playerId}/${upload}/${String(index).padStart(3, "0")}`;

export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  return Response.json({ access: await scannerAccess(player) });
}

export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = schema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("Unrecognised scan action");

  const body = parsed.data;
  const admin = getSupabaseAdmin();

  if (body.action === "begin") {
    /* The gate is asked before a single piece is sent, so a phone that
       may not scan learns it in one request, not after a dozen. */
    if ((await scannerAccess(player)) !== "on") {
      return Response.json({ error: "not-allowed" }, { status: 403 });
    }
    return Response.json({ uploadId: crypto.randomUUID() });
  }

  if (body.action === "chunk") {
    const limited = tooMany(
      `scan-chunk:${player.playerId}`,
      LIMITS.scanChunk.limit,
      LIMITS.scanChunk.windowMs,
    );
    if (limited) return limited;
    const { error } = await admin.storage
      .from("avatars")
      .upload(
        chunkPath(player.playerId, body.uploadId, body.index),
        new Blob([body.data], { type: CHUNK_TYPE }),
        { contentType: CHUNK_TYPE, upsert: true },
      );
    if (error) {
      console.error("Could not store a scan chunk", error);
      return Response.json({ error: "chunk-failed" }, { status: 500 });
    }
    return Response.json({ ok: true });
  }

  const paths = Array.from({ length: body.count }, (_, index) =>
    chunkPath(player.playerId, body.uploadId, index),
  );

  try {
    const pieces: (string | null)[] = new Array(paths.length).fill(null);
    let missing = false;
    for (
      let start = 0;
      start < paths.length && !missing;
      start += DOWNLOAD_CONCURRENCY
    ) {
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
    if (missing || pieces.some((piece) => piece === null)) {
      return badRequest("The photo is missing a piece. Take it again.");
    }

    const bytes = new Uint8Array(Buffer.from(pieces.join(""), "base64"));
    const outcome = await scanCard(player, bytes);
    return Response.json(outcome);
  } finally {
    await admin.storage
      .from("avatars")
      .remove(paths)
      .catch(() => {});
  }
}
