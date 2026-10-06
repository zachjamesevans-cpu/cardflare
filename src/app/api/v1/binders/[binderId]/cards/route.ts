import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import {
  binderAddedLine,
  binderAddSchema,
  binderPlaceSchema,
} from "@/lib/binder/add-copy";
import {
  addBinderCard,
  addBinderCards,
  placeBinderCard,
  readBinder,
  removeBinderCard,
} from "@/lib/binder/binder";
import { z } from "zod";
import { addCardSchema, binderIdSchema, forOldBuild } from "../../_shared";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ binderId: string }> };

/**
 * The cards in one of your binders. POST puts cards in: a batch from the
 * picker's tray or a confirmed pasted list (`{ items, pocket }`, the first
 * card in the tapped pocket and the rest in the next empty ones), or the
 * one card the builds before batches send (`{ cardId, printingId,
 * quantity }`), which goes after the last card. PATCH moves one card to a
 * pocket. DELETE takes one out. Each answers with the whole binder.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const id = binderIdSchema.safeParse((await params).binderId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });
  const body = await readJsonPayload(request);

  const batch = binderAddSchema.safeParse(body);
  if (batch.success) {
    const result = await addBinderCards(
      player.playerId,
      player.displayName,
      id.data,
      batch.data.items,
      batch.data.pocket,
    );
    if (!result.ok) {
      return Response.json(
        { error: result.reason },
        {
          status:
            result.reason === "at-cap"
              ? 409
              : result.reason === "not-yours"
                ? 404
                : 503,
        },
      );
    }
    const binder = await readBinder(player.playerId, player.playerId, id.data);
    return Response.json(
      absoluteImageUrls({
        binder: binder && forOldBuild(binder),
        message: binderAddedLine(result),
        firstPocket: result.firstPocket,
      }),
    );
  }

  const parsed = addCardSchema.safeParse(body);
  if (!parsed.success) return badRequest("items, or a cardId");
  const result = await addBinderCard(
    player.playerId,
    player.displayName,
    parsed.data,
    id.data,
  );
  if (!result.ok) {
    return Response.json(
      { error: result.reason },
      {
        status:
          result.reason === "at-cap" ? 409 : result.reason === "not-yours" ? 404 : 503,
      },
    );
  }
  const binder = await readBinder(player.playerId, player.playerId, id.data);
  return Response.json(absoluteImageUrls({ binder: binder && forOldBuild(binder) }));
}

/** One card to one pocket; a full pocket slides the run along to the next gap. */
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const id = binderIdSchema.safeParse((await params).binderId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });
  const parsed = binderPlaceSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("entryId and pocket are required");
  const result = await placeBinderCard(
    player.playerId,
    id.data,
    parsed.data.entryId,
    parsed.data.pocket,
  );
  if (!result.ok) return Response.json({ error: result.reason }, { status: 404 });
  const binder = await readBinder(player.playerId, player.playerId, id.data);
  return Response.json(absoluteImageUrls({ binder: binder && forOldBuild(binder) }));
}

const removeSchema = z.object({ entryId: z.guid() });

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const id = binderIdSchema.safeParse((await params).binderId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });
  const parsed = removeSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("entryId is required");
  const result = await removeBinderCard(
    player.playerId,
    player.displayName,
    parsed.data.entryId,
    id.data,
  );
  if (!result.ok) return Response.json({ error: result.reason }, { status: 404 });
  const binder = await readBinder(player.playerId, player.playerId, id.data);
  return Response.json(absoluteImageUrls({ binder: binder && forOldBuild(binder) }));
}
