import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { createBinder, listBinders, readBinder } from "@/lib/binder/binder";
import { isBinderCover } from "@/lib/binder/covers";
import { createSchema } from "./_shared";

export const dynamic = "force-dynamic";

/** Your binders, the Trade binder first; and a new custom one. */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const binders = await listBinders(player.playerId, player.playerId);
  return Response.json(absoluteImageUrls({ binders }));
}

export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const parsed = createSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("name is required, up to 40 characters");
  const result = await createBinder(player.playerId, {
    name: parsed.data.name,
    ...(parsed.data.cover && isBinderCover(parsed.data.cover)
      ? { cover: parsed.data.cover }
      : {}),
  });
  if (!result.ok) {
    return Response.json(
      { error: result.reason },
      {
        status:
          result.reason === "at-cap" ? 409 : result.reason === "invalid" ? 400 : 503,
      },
    );
  }
  const binder = await readBinder(player.playerId, player.playerId, result.id);
  return Response.json(absoluteImageUrls({ binder }));
}
