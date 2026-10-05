import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import {
  binderOwner,
  deleteBinder,
  readBinder,
  saveBinderSettings,
} from "@/lib/binder/binder";
import { binderIdSchema, forOldBuild, settingsSchema } from "../_shared";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ binderId: string }> };

/**
 * A binder by its id: one of yours, or somebody's binder up for trade
 * (the share link, cardflare.gg/b/<id>, opens the app here with nothing
 * but the id). `readBinder` still hides a private binder from anyone but
 * its owner. Change its settings or delete it: yours only.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const id = binderIdSchema.safeParse((await params).binderId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });
  const owner = (await binderOwner(id.data)) ?? player.playerId;
  const binder = await readBinder(owner, player.playerId, id.data);
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
