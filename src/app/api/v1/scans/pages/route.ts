import { z } from "zod";

import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { binderPagesSchema } from "@/lib/binder/pages-schema";
import {
  discardQueue,
  pagesLeftToday,
  placeQueue,
  queuesFor,
  queueView,
  sendPage,
} from "@/lib/cards/page-jobs";
import {
  POCKETS_PER_PAGE,
  SCAN_MAX_BYTES,
  pagesPlacedLine,
} from "@/lib/cards/scan-rules";
import { removeUploads, stitchUpload, uploadPaths } from "@/lib/cards/scan-uploads";

export const dynamic = "force-dynamic";
/* Sending a page reads it after the response, in this function: a
   careful read of a page can take a few minutes. */
export const maxDuration = 300;

/**
 * Binder pages read in the background, for the app.
 *
 * GET ?binder=<id> lists the queues waiting on that binder and the pages
 * left today; GET ?batch=<id> is one queue for its check, with links to
 * the player's own photos.
 *
 * POST "send-direct" carries a page in the body (the whole photo and its
 * nine pockets, base64) on a network that lets a body through; "send"
 * names uploads already sent in pieces through /api/v1/cards/scan for
 * one that does not. Either way the answer comes at once and the page
 * is read after it. "place" puts a checked queue in its binder; "discard"
 * throws one away.
 */

const MAX_CHARS = Math.ceil((SCAN_MAX_BYTES * 2 * 4) / 3) + 4;
const photo = z
  .string()
  .min(1)
  .max(MAX_CHARS)
  .regex(/^[A-Za-z0-9+/=]+$/);
const upload = z.object({
  uploadId: z.string().uuid(),
  count: z.number().int().min(1).max(500),
});
const where = {
  binderId: z.guid(),
  batchId: z.guid(),
  pageNumber: z.number().int().min(1).max(100),
};

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("send-direct"),
    ...where,
    page: photo,
    pockets: z.array(photo.nullable()).length(POCKETS_PER_PAGE),
  }),
  z.object({
    action: z.literal("send"),
    ...where,
    page: upload,
    pockets: z.array(upload.nullable()).length(POCKETS_PER_PAGE),
  }),
  z.object({
    action: z.literal("place"),
    batchId: z.guid(),
    placements: binderPagesSchema.shape.placements,
    /* False on every part but the last of a queue sent in parts. */
    last: z.boolean().optional().default(true),
  }),
  z.object({ action: z.literal("discard"), batchId: z.guid() }),
]);

const decode = (text: string) => new Uint8Array(Buffer.from(text, "base64"));

export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const url = new URL(request.url);
  const batch = z.guid().safeParse(url.searchParams.get("batch"));
  if (batch.success) {
    const view = await queueView(player, batch.data);
    if (!view) return Response.json({ error: "not-found" }, { status: 404 });
    return Response.json(absoluteImageUrls({ queue: view }));
  }
  const binder = z.guid().safeParse(url.searchParams.get("binder"));
  if (!binder.success) return badRequest("binder or batch");
  const [queues, left] = await Promise.all([
    queuesFor(player, binder.data),
    pagesLeftToday(player),
  ]);
  return Response.json({ queues, left });
}

export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = schema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("Unrecognised pages action");
  const body = parsed.data;

  if (body.action === "place") {
    const result = await placeQueue(
      player,
      player.displayName,
      body.batchId,
      body.placements,
      body.last,
    );
    if (!result.ok) {
      return Response.json(
        { error: result.reason },
        { status: result.reason === "unavailable" ? 503 : 404 },
      );
    }
    return Response.json({
      message: pagesPlacedLine(result),
      counts: {
        added: result.added,
        merged: result.merged,
        occupied: result.occupied,
        skipped: result.skipped,
      },
    });
  }

  if (body.action === "discard") {
    return Response.json({ ok: await discardQueue(player, body.batchId) });
  }

  const answer = (result: Awaited<ReturnType<typeof sendPage>>): Response =>
    result.ok
      ? Response.json(result)
      : Response.json(
          { ok: false, reason: result.reason },
          {
            status:
              result.reason === "not-allowed"
                ? 403
                : result.reason === "daily-pages" || result.reason === "queue-full"
                  ? 429
                  : result.reason === "unavailable"
                    ? 503
                    : 400,
          },
        );

  const where = {
    binderId: body.binderId,
    batchId: body.batchId,
    pageNumber: body.pageNumber,
  };

  if (body.action === "send-direct") {
    return answer(
      await sendPage(player, {
        ...where,
        page: decode(body.page),
        pockets: body.pockets.map((cell) => (cell ? decode(cell) : null)),
      }),
    );
  }

  const pathsOf = [body.page, ...body.pockets].map((cell) =>
    cell ? uploadPaths(player.playerId, cell) : [],
  );
  try {
    const photos = await Promise.all(
      pathsOf.map((paths) => (paths.length > 0 ? stitchUpload(paths) : null)),
    );
    if (photos.some((bytes, at) => bytes === null && pathsOf[at].length > 0)) {
      return badRequest("The photo is missing a piece. Take it again.");
    }
    const [page, ...pockets] = photos;
    return answer(
      await sendPage(player, { ...where, page: page ?? new Uint8Array(), pockets }),
    );
  } finally {
    await removeUploads(pathsOf.flat());
  }
}
