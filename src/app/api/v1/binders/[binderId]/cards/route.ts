import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { addBinderCard, readBinder, removeBinderCard } from "@/lib/binder/binder";
import { z } from "zod";
import { addCardSchema, binderIdSchema } from "../../_shared";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ binderId: string }> };

/** The cards in one of your binders: one in, one out. Each answers with the whole binder. */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const id = binderIdSchema.safeParse((await params).binderId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });
  const parsed = addCardSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("cardId is required");
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
  return Response.json(absoluteImageUrls({ binder }));
}

const removeSchema = z.object({ entryId: z.guid() });

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const id = binderIdSchema.safeParse((await params).binderId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });
  const parsed = removeSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("entryId is required");
  const result = await removeBinderCard(player.playerId, parsed.data.entryId, id.data);
  if (!result.ok) return Response.json({ error: result.reason }, { status: 404 });
  const binder = await readBinder(player.playerId, player.playerId, id.data);
  return Response.json(absoluteImageUrls({ binder }));
}
