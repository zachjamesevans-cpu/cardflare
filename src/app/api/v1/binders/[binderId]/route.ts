import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { deleteBinder, readBinder, saveBinderSettings } from "@/lib/binder/binder";
import { binderIdSchema, forOldBuild, settingsSchema } from "../_shared";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ binderId: string }> };

/** One of your binders: read it, change its settings, or delete it. */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const id = binderIdSchema.safeParse((await params).binderId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });
  const binder = await readBinder(player.playerId, player.playerId, id.data);
  if (!binder) return Response.json({ error: "not-found" }, { status: 404 });
  return Response.json(absoluteImageUrls({ binder: forOldBuild(binder) }));
}

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const id = binderIdSchema.safeParse((await params).binderId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });
  const parsed = settingsSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("name, cover or forTrade");
  const saved = await saveBinderSettings(
    player.playerId,
    player.displayName,
    parsed.data,
    id.data,
  );
  if (!saved.ok) {
    return Response.json(
      { error: saved.reason },
      {
        status:
          saved.reason === "not-yours" ? 404 : saved.reason === "invalid" ? 400 : 503,
      },
    );
  }
  const binder = await readBinder(player.playerId, player.playerId, id.data);
  if (!binder) return Response.json({ error: "not-found" }, { status: 404 });
  return Response.json(absoluteImageUrls({ binder: forOldBuild(binder) }));
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const id = binderIdSchema.safeParse((await params).binderId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });
  const result = await deleteBinder(player.playerId, player.displayName, id.data);
  if (!result.ok) {
    return Response.json(
      { error: result.reason },
      { status: result.reason === "not-yours" ? 404 : 503 },
    );
  }
  return Response.json({ ok: true });
}
