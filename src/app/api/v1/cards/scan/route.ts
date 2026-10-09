import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { LIMITS, tooMany } from "@/lib/api/throttle";
import { scanCard, scanPage, scannerAccess } from "@/lib/cards/scan";
import { POCKETS_PER_PAGE, SCAN_MAX_BYTES } from "@/lib/cards/scan-rules";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * The card scanner for the app.
 *
 * GET says whether this player sees the scan button ("on"), the door to
 * Pro ("pro-door"), or nothing (null).
 *
 * POST takes a photo two ways. The quick way is the photo in the body,
 * one request: "read-direct" for a card, "read-page-direct" for the nine
 * pockets of a page. On some networks (the founder's, for one) a request
 * with a body dies in transit, so the app falls back to the way a
 * profile picture travels (see /api/v1/avatar): "begin", numbered base64
 * chunks in the payload header, then "read" for a card or "read-page"
 * with one upload per pocket, which stitches the pieces, scans, and
 * drops them. The photo is never kept, either way.
 */

/* The avatar route's proven chunk size, and enough of them for the
   scanner's ceiling once base64 has grown it by a third. */
const CHUNK_MAX_CHARS = 8000;
const CHUNK_MAX_COUNT = Math.ceil((SCAN_MAX_BYTES * 4) / 3 / CHUNK_MAX_CHARS);
/** A whole photo as base64 text, at the scanner's ceiling. */
const PHOTO_MAX_CHARS = Math.ceil((SCAN_MAX_BYTES * 4) / 3) + 4;

const uploadId = z.string().uuid();
const base64 = z.string().regex(/^[A-Za-z0-9+/=]+$/);
const photo = base64.min(1).max(PHOTO_MAX_CHARS);
const upload = z.object({
  uploadId,
  count: z.number().int().min(1).max(CHUNK_MAX_COUNT),
});

const schema = z.discriminatedUnion("action", [
  /* A tiny request WITH a body: whether this network lets one through,
     asked once per app session before a photo is sent the quick way. */
  z.object({ action: z.literal("probe") }),
  z.object({ action: z.literal("begin") }),
  z.object({
    action: z.literal("chunk"),
    uploadId,
    index: z
      .number()
      .int()
      .min(0)
      .max(CHUNK_MAX_COUNT - 1),
    data: base64.min(1).max(CHUNK_MAX_CHARS),
  }),
  z.object({ action: z.literal("read"), uploadId, count: upload.shape.count }),
  z.object({
    action: z.literal("read-page"),
    cells: z.array(upload.nullable()).length(POCKETS_PER_PAGE),
  }),
  z.object({ action: z.literal("read-direct"), data: photo }),
  z.object({
    action: z.literal("read-page-direct"),
    cells: z.array(photo.nullable()).length(POCKETS_PER_PAGE),
  }),
]);

const CHUNK_TYPE = "application/octet-stream";
const DOWNLOAD_CONCURRENCY = 16;

const chunkPath = (playerId: string, upload: string, index: number) =>
  `tmp/scan/${playerId}/${upload}/${String(index).padStart(3, "0")}`;

const decode = (text: string) => new Uint8Array(Buffer.from(text, "base64"));

export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  return Response.json({ access: await scannerAccess(player) });
}

/**
 * One chunked upload's pieces, fetched several at a time and put back in
 * order, or null when one is missing. The pieces are left for the caller
 * to remove, so a failed read drops them too.
 */
async function stitch(paths: string[]): Promise<Uint8Array | null> {
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
  return decode(pieces.join(""));
}

export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = schema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("Unrecognised scan action");

  const body = parsed.data;
  const admin = getSupabaseAdmin();

  if (body.action === "probe") return Response.json({ ok: true });

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

  if (body.action === "read-direct") {
    return Response.json(await scanCard(player, decode(body.data)));
  }

  if (body.action === "read-page-direct") {
    return Response.json(
      await scanPage(
        player,
        body.cells.map((cell) => (cell ? decode(cell) : null)),
      ),
    );
  }

  const uploads =
    body.action === "read"
      ? [{ uploadId: body.uploadId, count: body.count }]
      : body.cells;
  const pathsOf = uploads.map((cell) =>
    cell
      ? Array.from({ length: cell.count }, (_, index) =>
          chunkPath(player.playerId, cell.uploadId, index),
        )
      : [],
  );

  try {
    const photos = await Promise.all(
      pathsOf.map((paths) => (paths.length > 0 ? stitch(paths) : null)),
    );
    if (photos.some((bytes, at) => bytes === null && pathsOf[at].length > 0)) {
      return badRequest("The photo is missing a piece. Take it again.");
    }
    return Response.json(
      body.action === "read"
        ? await scanCard(player, photos[0] ?? new Uint8Array())
        : await scanPage(player, photos),
    );
  } finally {
    /* The tmp pieces go regardless of how the read went. */
    await admin.storage
      .from("avatars")
      .remove(pathsOf.flat())
      .catch(() => {});
  }
}
