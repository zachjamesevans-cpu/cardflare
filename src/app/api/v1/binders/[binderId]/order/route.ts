import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { readBinder, saveBinderOrder } from "@/lib/binder/binder";
import { z } from "zod";
import { binderIdSchema, forOldBuild } from "../../_shared";

export const dynamic = "force-dynamic";

const orderSchema = z.object({ entryIds: z.array(z.guid()).max(400) });

/** The owner's new order, the whole binder's entry ids pocket by pocket. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ binderId: string }> },
): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const id = binderIdSchema.safeParse((await params).binderId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });
  const parsed = orderSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("entryIds is required");
  const result = await saveBinderOrder(player.playerId, parsed.data.entryIds, id.data);
  if (!result.ok) {
    return Response.json(
      { error: result.reason },
      { status: result.reason === "not-yours" ? 404 : 503 },
    );
  }
  const binder = await readBinder(player.playerId, player.playerId, id.data);
  return Response.json(absoluteImageUrls({ binder: binder && forOldBuild(binder) }));
}
