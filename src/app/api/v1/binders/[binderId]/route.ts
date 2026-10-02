import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { deleteBinder, readBinder, saveBinderSettings } from "@/lib/binder/binder";
import { isBinderCover } from "@/lib/binder/covers";
import { binderIdSchema, settingsSchema } from "../_shared";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ binderId: string }> };

/** One of your binders: read it, change its settings, or delete a custom one. */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const id = binderIdSchema.safeParse((await params).binderId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });
  const binder = await readBinder(player.playerId, player.playerId, id.data);
  if (!binder) return Response.json({ error: "not-found" }, { status: 404 });
  return Response.json(absoluteImageUrls({ binder }));
}

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const id = binderIdSchema.safeParse((await params).binderId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });
  const parsed = settingsSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success)
    return badRequest("isPublic, layout, cover, frontEntryId or name");
  const patch = parsed.data;
  await saveBinderSettings(
    player.playerId,
    {
      ...(patch.isPublic !== undefined ? { isPublic: patch.isPublic } : {}),
      ...(patch.layout !== undefined ? { layout: patch.layout } : {}),
      ...(patch.cover !== undefined && isBinderCover(patch.cover)
        ? { cover: patch.cover }
        : {}),
      ...(patch.frontEntryId !== undefined ? { frontEntryId: patch.frontEntryId } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
    },
    id.data,
  );
  const binder = await readBinder(player.playerId, player.playerId, id.data);
  if (!binder) return Response.json({ error: "not-found" }, { status: 404 });
  return Response.json(absoluteImageUrls({ binder }));
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const id = binderIdSchema.safeParse((await params).binderId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });
  const result = await deleteBinder(player.playerId, id.data);
  if (!result.ok) {
    return Response.json(
      { error: result.reason },
      {
        status:
          result.reason === "invalid" ? 400 : result.reason === "not-yours" ? 404 : 503,
      },
    );
  }
  return Response.json({ ok: true });
}
